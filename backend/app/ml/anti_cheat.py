"""
anti_cheat.py - Multi-model proctoring engine (MediaPipe FaceLandmarker + YOLOv8 + Haar fallback).

Public API (unchanged): analyze_frame, get_or_create_session, get_session, reset_session,
add_proctor_message, SessionState, ProctoringEvent. New helper: set_face_zone.

Face safe zone:
  The candidate's face must stay inside a configurable rectangle (fractions of the frame).
  If it leaves, the box is relabelled "Unidentified" and a `face_out_of_zone` violation is
  raised after ZONE_CONFIRM_FRAMES consecutive frames. The zone is also returned in
  `bounding_boxes.zone` so the frontend can draw it.

Earlier changes (kept): pose/gaze for the same face labelled Candidate, fixed pitch labels,
per-session baseline calibration, blendshape-based eye gaze, MediaPipe on the original frame,
Haar only as fallback, no fabricated YOLO faces, episode-based multi-person strikes,
2-run object confirmation, cached YOLO every 3rd frame, tolerant base64 decode, lock-guarded
inference.
"""

from __future__ import annotations

import base64
import logging
import statistics
import threading
import time
import uuid
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Tunables
# ---------------------------------------------------------------------------
MAX_WORK_DIM = 960            # downscale larger frames for speed
YOLO_EVERY_N_FRAMES = 3       # run YOLO on every Nth frame, reuse cached result between
CALIB_FRAMES = 10             # frames used to learn the candidate's neutral head pose
YAW_LIMIT = 25.0              # degrees away from neutral before "head turned"
PITCH_DOWN_LIMIT = 22.0
PITCH_UP_LIMIT = 20.0
NO_FACE_CONFIRM_FRAMES = 3
HEAD_CONFIRM_FRAMES = 3
GAZE_CONFIRM_FRAMES = 4
OBJECT_CONFIRM_RUNS = 2
MULTI_CONFIRM_FRAMES = 4
MULTI_CONFIRM_SECONDS = 1.5
MULTI_CLEAR_SECONDS = 3.0     # people must be gone this long for an episode to end
MULTI_REPEAT_SECONDS = 15.0   # extra strike if a second person stays this long
MIN_SECONDARY_FACE_H = 0.06   # secondary faces smaller than 6% of frame height are ignored
MIN_SECONDARY_FACE_AREA = 0.08  # ... or smaller than 8% of the candidate's face area

# Safe zone as fractions of the frame: (x_min, y_min, x_max, y_max)
DEFAULT_FACE_ZONE = (0.20, 0.08, 0.80, 0.92)
ZONE_MIN_OVERLAP = 0.60       # at least 60% of the face box must be inside the zone
ZONE_CONFIRM_FRAMES = 3       # consecutive frames outside before it becomes a violation

# ---------------------------------------------------------------------------
# Lazy model holders
# ---------------------------------------------------------------------------
_MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
_YOLO_PATH = _MODELS_DIR / "yolov8n.pt"
_MEDIAPIPE_TASK_PATH = _MODELS_DIR / "face_landmarker.task"

_yolo_model: Any = None  # None = not tried, False = unavailable
_mediapipe_landmarker: Any = None
_cv2_face_cascade = None
_cv2_available = False
_model_lock = threading.Lock()
_infer_lock = threading.Lock()

try:
    import cv2
    import numpy as np

    _cascade_file = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    _cv2_face_cascade = cv2.CascadeClassifier(_cascade_file)
    _cv2_available = not _cv2_face_cascade.empty()
except Exception as e:  # noqa: BLE001
    logger.warning("anti_cheat: OpenCV import issue: %s", e)
    cv2 = None
    np = None


def _get_yolo_model():
    global _yolo_model
    if _yolo_model is not None:
        return None if _yolo_model is False else _yolo_model
    with _model_lock:
        if _yolo_model is None:
            try:
                from ultralytics import YOLO

                target = _YOLO_PATH if _YOLO_PATH.exists() else Path("yolov8n.pt")
                if target.exists():
                    _yolo_model = YOLO(str(target))
                    logger.info("anti_cheat: Loaded YOLOv8 model from %s", target)
                else:
                    logger.error("anti_cheat: YOLO weights not found at %s - object/person detection disabled", _YOLO_PATH)
                    _yolo_model = False
            except Exception as e:  # noqa: BLE001
                logger.warning("anti_cheat: Could not load YOLOv8: %s", e)
                _yolo_model = False
    return None if _yolo_model is False else _yolo_model


def _get_mediapipe_landmarker():
    global _mediapipe_landmarker
    if _mediapipe_landmarker is not None:
        return None if _mediapipe_landmarker is False else _mediapipe_landmarker
    with _model_lock:
        if _mediapipe_landmarker is None:
            try:
                from mediapipe.tasks.python import vision
                from mediapipe.tasks.python.core.base_options import BaseOptions

                if not _MEDIAPIPE_TASK_PATH.exists():
                    logger.error(
                        "anti_cheat: %s not found - MediaPipe face detection DISABLED. "
                        "Download face_landmarker.task from the MediaPipe model page into that folder.",
                        _MEDIAPIPE_TASK_PATH,
                    )
                    _mediapipe_landmarker = False
                else:
                    options = vision.FaceLandmarkerOptions(
                        base_options=BaseOptions(model_asset_path=str(_MEDIAPIPE_TASK_PATH)),
                        output_face_blendshapes=True,
                        num_faces=4,
                        min_face_detection_confidence=0.5,
                        min_face_presence_confidence=0.5,
                    )
                    _mediapipe_landmarker = vision.FaceLandmarker.create_from_options(options)
                    logger.info("anti_cheat: MediaPipe FaceLandmarker loaded from %s", _MEDIAPIPE_TASK_PATH)
            except Exception as e:  # noqa: BLE001
                logger.warning("anti_cheat: Could not initialize MediaPipe FaceLandmarker: %s", e)
                _mediapipe_landmarker = False
    return None if _mediapipe_landmarker is False else _mediapipe_landmarker


# ---------------------------------------------------------------------------
# Session state
# ---------------------------------------------------------------------------
@dataclass
class ProctoringEvent:
    id: str
    rule: str
    event_type: str
    severity: str  # "LOW", "MEDIUM", "HIGH"
    description: str
    started_at: float
    last_seen_at: float
    duration_seconds: float = 0.0
    active: bool = True


@dataclass
class SessionState:
    session_id: str
    created_at: float = field(default_factory=time.time)
    frame_count: int = 0
    history: deque = field(default_factory=lambda: deque(maxlen=15))
    active_events: dict[str, ProctoringEvent] = field(default_factory=dict)
    completed_events: list[dict[str, Any]] = field(default_factory=list)
    streak_no_face: int = 0
    streak_multi_face: int = 0
    streak_head_turned: int = 0
    streak_eye_diverted: int = 0
    streak_out_of_zone: int = 0
    zone: tuple[float, float, float, float] = DEFAULT_FACE_ZONE
    streak_phone: int = 0
    streak_book: int = 0
    integrity_score: int = 100

    smoothed_head_pose: dict[str, float] = field(default_factory=lambda: {"yaw": 0.0, "pitch": 0.0, "roll": 0.0})
    candidate_bbox: tuple[int, int, int, int] | None = None

    # Neutral-pose calibration
    calib_samples: list[tuple[float, float]] = field(default_factory=list)
    baseline_yaw: float = 0.0
    baseline_pitch: float = 0.0
    calibrated: bool = False

    # Multi-person strike policy
    multi_face_strikes: int = 0
    last_multi_face_strike_time: float = 0.0
    multi_since: float = 0.0
    multi_last_seen: float = 0.0
    multi_episode_active: bool = False
    strike_records: list[dict[str, Any]] = field(default_factory=list)
    terminated_for_cheating: bool = False
    negative_marking_applied: bool = False

    # YOLO cache / object streaks (counted per fresh YOLO run)
    yolo_cache: dict[str, Any] = field(default_factory=dict)
    last_yolo_frame: int = -10_000
    obj_streaks: dict[str, int] = field(default_factory=dict)

    # FPS estimate
    last_perf: float = 0.0
    fps: float = 0.0

    # Interviewer live buffer
    latest_frame_b64: str = ""
    latest_telemetry: dict[str, Any] = field(default_factory=dict)
    latest_boxes: dict[str, Any] = field(default_factory=dict)
    latest_transcript: str = ""
    proctor_messages: list[dict[str, Any]] = field(default_factory=list)


_sessions: dict[str, SessionState] = {}


def get_or_create_session(session_id: str | None) -> SessionState:
    sid = (session_id or "default_interview").strip()
    if sid not in _sessions:
        _sessions[sid] = SessionState(session_id=sid)
    return _sessions[sid]


def get_session(session_id: str | None) -> SessionState | None:
    sid = (session_id or "default_interview").strip()
    return _sessions.get(sid)


def reset_session(session_id: str | None) -> None:
    sid = (session_id or "default_interview").strip()
    if sid in _sessions:
        del _sessions[sid]


def recalibrate_session(session_id: str | None) -> None:
    """Re-learn the candidate's neutral head pose (e.g. after they re-seat the camera)."""
    s = get_or_create_session(session_id)
    s.calib_samples.clear()
    s.calibrated = False
    s.baseline_yaw = s.baseline_pitch = 0.0


def set_face_zone(session_id: str | None, x_min: float, y_min: float, x_max: float, y_max: float) -> None:
    """Set the allowed face area (fractions 0..1 of the frame). Can be called per session."""
    s = get_or_create_session(session_id)
    x_min, x_max = sorted((max(0.0, x_min), min(1.0, x_max)))
    y_min, y_max = sorted((max(0.0, y_min), min(1.0, y_max)))
    if x_max - x_min < 0.1 or y_max - y_min < 0.1:
        raise ValueError("Zone is too small")
    s.zone = (x_min, y_min, x_max, y_max)
    s.streak_out_of_zone = 0


def add_proctor_message(session_id: str | None, message: str, sender: str = "Interviewer") -> None:
    session = get_or_create_session(session_id)
    session.proctor_messages.append({
        "id": str(uuid.uuid4())[:8],
        "sender": sender,
        "message": message,
        "timestamp": datetime.now(timezone.utc).strftime("%H:%M:%S"),
    })


# ---------------------------------------------------------------------------
# Geometry helpers
# ---------------------------------------------------------------------------
def _compute_iou(a, b) -> float:
    """IoU between two [x, y, w, h] boxes."""
    xA, yA = max(a[0], b[0]), max(a[1], b[1])
    xB, yB = min(a[0] + a[2], b[0] + b[2]), min(a[1] + a[3], b[1] + b[3])
    inter = max(0, xB - xA) * max(0, yB - yA)
    union = float(max(1, a[2] * a[3]) + max(1, b[2] * b[3]) - inter)
    return inter / union if union > 0 else 0.0


def _containment(a, b) -> float:
    """Intersection area divided by the SMALLER box area ([x, y, w, h] boxes)."""
    xA, yA = max(a[0], b[0]), max(a[1], b[1])
    xB, yB = min(a[0] + a[2], b[0] + b[2]), min(a[1] + a[3], b[1] + b[3])
    inter = max(0, xB - xA) * max(0, yB - yA)
    return inter / float(max(1, min(a[2] * a[3], b[2] * b[3])))


def _face_in_zone(box: dict[str, Any], frame_w: int, frame_h: int, zone) -> bool:
    """True if >= ZONE_MIN_OVERLAP of the face box lies inside the zone."""
    zx1, zy1, zx2, zy2 = zone[0] * frame_w, zone[1] * frame_h, zone[2] * frame_w, zone[3] * frame_h
    x1, y1, x2, y2 = box["x"], box["y"], box["x"] + box["w"], box["y"] + box["h"]
    inter = max(0.0, min(x2, zx2) - max(x1, zx1)) * max(0.0, min(y2, zy2) - max(y1, zy1))
    area = float(max(1, box["w"] * box["h"]))
    return (inter / area) >= ZONE_MIN_OVERLAP


def _box_from_landmarks(lms, w: int, h: int) -> list[int]:
    xs = [lm.x * w for lm in lms]
    ys = [lm.y * h for lm in lms]
    x1, x2 = int(max(0, min(xs))), int(min(w, max(xs)))
    y1, y2 = int(max(0, min(ys))), int(min(h, max(ys)))
    return [x1, y1, max(1, x2 - x1), max(1, y2 - y1)]


def _pick_primary(boxes: list[list[int]], last_bbox, frame_w: int) -> int:
    """Candidate = best IoU with the previous candidate, else the largest / most central face."""
    if last_bbox:
        ious = [_compute_iou(b, list(last_bbox)) for b in boxes]
        j = max(range(len(boxes)), key=lambda i: ious[i])
        if ious[j] > 0.15:
            return j
    return max(
        range(len(boxes)),
        key=lambda i: (boxes[i][2] * boxes[i][3], -abs(boxes[i][0] + boxes[i][2] / 2 - frame_w / 2)),
    )


# ---------------------------------------------------------------------------
# Image preprocessing (only used when the frame is dark / washed out)
# ---------------------------------------------------------------------------
def _frame_is_poor(frame: np.ndarray) -> bool:
    try:
        mean_v = float(np.mean(cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)[:, :, 2]))
        return mean_v < 85 or mean_v > 185
    except Exception:  # noqa: BLE001
        return False


def _enhance_lighting(frame: np.ndarray) -> np.ndarray:
    """Adaptive gamma + LAB CLAHE for dim or overexposed webcams."""
    try:
        mean_v = float(np.mean(cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)[:, :, 2]))
        adjusted = frame
        gamma = None
        if mean_v < 85:
            gamma = max(0.55, mean_v / 100.0)
        elif mean_v > 185:
            gamma = 1.35
        if gamma:
            inv = 1.0 / gamma
            lut = np.array([((i / 255.0) ** inv) * 255 for i in range(256)]).astype("uint8")
            adjusted = cv2.LUT(frame, lut)
        lab = cv2.cvtColor(adjusted, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        l = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8)).apply(l)
        return cv2.cvtColor(cv2.merge((l, a, b)), cv2.COLOR_LAB2BGR)
    except Exception:  # noqa: BLE001
        return frame


# ---------------------------------------------------------------------------
# Head pose (solvePnP). Convention returned by this function:
#   yaw   > 0  -> face turned toward the IMAGE-LEFT   (verified numerically)
#   pitch > 0  -> face tilted DOWN, pitch < 0 -> UP    (verified numerically)
# ---------------------------------------------------------------------------
_HEAD_3D = (
    np.array(
        [
            (0.0, 0.0, 0.0),          # nose tip (1)
            (0.0, -330.0, -65.0),     # chin (152)
            (-225.0, 170.0, -135.0),  # eye outer corner (33)
            (225.0, 170.0, -135.0),   # eye outer corner (263)
            (-150.0, -150.0, -125.0), # mouth corner (61)
            (150.0, -150.0, -125.0),  # mouth corner (291)
            (0.0, 220.0, -80.0),      # forehead (10)
            (-380.0, 0.0, -180.0),    # ear (234)
            (380.0, 0.0, -180.0),     # ear (454)
        ],
        dtype=np.float64,
    )
    if np is not None
    else None
)
_POSE_IDX = (1, 152, 33, 263, 61, 291, 10, 234, 454)


def _calculate_head_pose(landmarks: list, frame_w: int, frame_h: int, prev_pose: dict[str, float] | None = None) -> dict[str, float]:
    """Raw (uncalibrated) yaw/pitch/roll with EMA smoothing. Returns {} on failure."""
    try:
        face_2d = np.array([(landmarks[i].x * frame_w, landmarks[i].y * frame_h) for i in _POSE_IDX], dtype=np.float64)
        cam = np.array([[frame_w, 0, frame_w / 2], [0, frame_w, frame_h / 2], [0, 0, 1]], dtype=np.float64)
        ok, rvec, _ = cv2.solvePnP(_HEAD_3D, face_2d, cam, np.zeros((4, 1)), flags=cv2.SOLVEPNP_ITERATIVE)
        if not ok:
            return {}
        rmat, _ = cv2.Rodrigues(rvec)
        angles = cv2.RQDecomp3x3(rmat)[0]
        pitch, yaw, roll = float(angles[0]), float(angles[1]), float(angles[2])
        for _ in range(2):  # unwrap +-180 flips
            if pitch > 90:
                pitch -= 180
            elif pitch < -90:
                pitch += 180
            if yaw > 90:
                yaw -= 180
            elif yaw < -90:
                yaw += 180
        if roll > 90:
            roll -= 180
        elif roll < -90:
            roll += 180

        if prev_pose and "yaw" in prev_pose and (prev_pose["yaw"] or prev_pose["pitch"]):
            a = 0.65  # weight of the new measurement
            yaw = a * yaw + (1 - a) * prev_pose["yaw"]
            pitch = a * pitch + (1 - a) * prev_pose["pitch"]
            roll = a * roll + (1 - a) * prev_pose["roll"]
        return {"yaw": yaw, "pitch": pitch, "roll": roll}
    except Exception as e:  # noqa: BLE001
        logger.debug("Head pose error: %s", e)
        return {}


def _classify_direction(yaw_rel: float, pitch_rel: float) -> str:
    if yaw_rel > YAW_LIMIT:
        return "LEFT"
    if yaw_rel < -YAW_LIMIT:
        return "RIGHT"
    if pitch_rel > PITCH_DOWN_LIMIT:
        return "DOWN"
    if pitch_rel < -PITCH_UP_LIMIT:
        return "UP"
    return "CENTER"


# ---------------------------------------------------------------------------
# Eye gaze + facial micro-metrics
# ---------------------------------------------------------------------------
def _calculate_eye_gaze_and_metrics(
    landmarks: list,
    blendshapes: list | None = None,
    head_yaw: float = 0.0,
    head_pitch: float = 0.0,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """
    Gaze from MediaPipe eyeLook* blendshapes (robust, relative to the head).
    Falls back to the horizontal iris ratio when blendshapes are unavailable.
    Direction labels are IMAGE sides (same convention as head yaw).
    """
    gaze = {"direction": "CENTER", "horizontal": "CENTER", "vertical": "CENTER", "diverted": False, "ratio": 0.50}
    metrics = {"mouth_open": False, "mouth_ratio": 0.0, "ear": 0.30}
    try:
        bs = {b.category_name: b.score for b in blendshapes} if blendshapes else {}
        have_478 = len(landmarks) >= 478

        mean_ear = 0.30
        h_ratio = 0.50
        if have_478:
            l_w = max(0.001, abs(landmarks[33].x - landmarks[133].x))
            r_w = max(0.001, abs(landmarks[263].x - landmarks[362].x))
            ear_l = (abs(landmarks[160].y - landmarks[144].y) + abs(landmarks[158].y - landmarks[153].y)) / (2.0 * l_w)
            ear_r = (abs(landmarks[385].y - landmarks[380].y) + abs(landmarks[387].y - landmarks[373].y)) / (2.0 * r_w)
            mean_ear = (ear_l + ear_r) / 2.0
            l_ratio = (landmarks[468].x - min(landmarks[33].x, landmarks[133].x)) / l_w
            r_ratio = (landmarks[473].x - min(landmarks[263].x, landmarks[362].x)) / r_w
            h_ratio = (l_ratio + r_ratio) / 2.0
        metrics["ear"] = round(mean_ear, 2)

        # Mouth (telemetry only)
        if "jawOpen" in bs:
            metrics["mouth_ratio"] = round(bs["jawOpen"], 2)
            metrics["mouth_open"] = bs["jawOpen"] > 0.25
        else:
            lip = abs(landmarks[13].y - landmarks[14].y)
            mw = abs(landmarks[61].x - landmarks[291].x)
            if mw > 0.01:
                metrics["mouth_ratio"] = round(lip / mw, 2)
                metrics["mouth_open"] = (lip / mw) > 0.35

        if bs:
            blink = (bs.get("eyeBlinkLeft", 0.0) + bs.get("eyeBlinkRight", 0.0)) / 2.0 > 0.55
        else:
            blink = mean_ear < 0.16
        if blink:
            return gaze, metrics

        if bs:
            # Subject's left eye = blendshape "Left". Toward subject's right == toward image-left.
            to_img_left = (bs.get("eyeLookInLeft", 0.0) + bs.get("eyeLookOutRight", 0.0)) / 2.0
            to_img_right = (bs.get("eyeLookOutLeft", 0.0) + bs.get("eyeLookInRight", 0.0)) / 2.0
            down = (bs.get("eyeLookDownLeft", 0.0) + bs.get("eyeLookDownRight", 0.0)) / 2.0
            up = (bs.get("eyeLookUpLeft", 0.0) + bs.get("eyeLookUpRight", 0.0)) / 2.0

            dir_h = "LEFT" if to_img_left > 0.45 else "RIGHT" if to_img_right > 0.45 else "CENTER"
            dir_v = "DOWN" if down > 0.50 else "UP" if up > 0.55 else "CENTER"
            effective_h = head_yaw + (to_img_left - to_img_right) * 30.0
            gaze = {
                "direction": dir_h if dir_h != "CENTER" else dir_v,
                "horizontal": dir_h,
                "vertical": dir_v,
                "diverted": dir_h != "CENTER" or dir_v != "CENTER",
                "ratio": round(h_ratio, 2),
                "v_ratio": round(max(0.0, min(1.0, 0.5 + (down - up) / 2.0)), 2),
                "effective_angle_h": round(effective_h, 1),
            }
        elif have_478:
            dir_h = "LEFT" if h_ratio < 0.28 else "RIGHT" if h_ratio > 0.72 else "CENTER"
            gaze = {
                "direction": dir_h,
                "horizontal": dir_h,
                "vertical": "CENTER",
                "diverted": dir_h != "CENTER",
                "ratio": round(h_ratio, 2),
                "v_ratio": 0.5,
                "effective_angle_h": round(head_yaw + (0.5 - h_ratio) * 45.0, 1),
            }
        return gaze, metrics
    except Exception as e:  # noqa: BLE001
        logger.debug("Eye gaze error: %s", e)
        return gaze, metrics


# ---------------------------------------------------------------------------
# Mesh overlay points
# ---------------------------------------------------------------------------
_KEY_LANDMARK_INDICES = [
    10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400,
    377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
    1, 2, 98, 327,
    33, 160, 158, 133, 153, 144,
    263, 387, 385, 362, 380, 373,
    61, 291, 0, 17,
]


def _extract_mesh_points(landmarks: list, frame_w: int, frame_h: int) -> list[list[int]]:
    try:
        return [
            [int(landmarks[i].x * frame_w), int(landmarks[i].y * frame_h)]
            for i in _KEY_LANDMARK_INDICES
            if i < len(landmarks)
        ]
    except Exception:  # noqa: BLE001
        return []


# ---------------------------------------------------------------------------
# Face detection (MediaPipe primary, Haar fallback)
# ---------------------------------------------------------------------------
def _run_mediapipe(frame: np.ndarray):
    landmarker = _get_mediapipe_landmarker()
    if landmarker is None:
        return None
    try:
        import mediapipe as mp

        rgb = np.ascontiguousarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        with _infer_lock:
            return landmarker.detect(mp_img)
    except Exception as e:  # noqa: BLE001
        logger.warning("anti_cheat: MediaPipe inference error: %s", e)
        return None


def _detect_faces(work: np.ndarray, session: SessionState) -> dict[str, Any]:
    """
    Returns {"boxes": [primary, *secondary], "landmarks": primary lms | None,
             "blendshapes": primary blendshapes | None}.
    Boxes are dicts with x, y, w, h, label, is_primary, status, source.
    """
    h, w = work.shape[:2]
    out: dict[str, Any] = {"boxes": [], "landmarks": None, "blendshapes": None}

    result = _run_mediapipe(work)
    if (result is None or not result.face_landmarks) and _get_mediapipe_landmarker() is not None and _frame_is_poor(work):
        retry = _run_mediapipe(_enhance_lighting(work))
        if retry is not None:
            result = retry

    if result is not None and result.face_landmarks:
        raw = [_box_from_landmarks(l, w, h) for l in result.face_landmarks]
        pi = _pick_primary(raw, session.candidate_bbox, w)
        pbox = raw[pi]
        out["landmarks"] = result.face_landmarks[pi]
        if result.face_blendshapes and pi < len(result.face_blendshapes):
            out["blendshapes"] = result.face_blendshapes[pi]
        out["boxes"].append({"x": pbox[0], "y": pbox[1], "w": pbox[2], "h": pbox[3],
                             "label": "Candidate", "is_primary": True, "status": "verified", "source": "mediapipe"})
        p_area = pbox[2] * pbox[3]
        for i, b in enumerate(raw):
            if i == pi:
                continue
            # ignore tiny background faces / detector noise
            if b[3] < MIN_SECONDARY_FACE_H * h or b[2] * b[3] < MIN_SECONDARY_FACE_AREA * p_area:
                continue
            out["boxes"].append({"x": b[0], "y": b[1], "w": b[2], "h": b[3], "label": "", "is_primary": False,
                                 "status": "flagged", "source": "mediapipe"})
        return out

    # Haar fallback only when MediaPipe found nothing (dark / angled / model missing)
    if _cv2_available and _cv2_face_cascade is not None:
        try:
            gray = cv2.cvtColor(_enhance_lighting(work), cv2.COLOR_BGR2GRAY)
            min_sz = max(40, int(0.10 * h))
            det = _cv2_face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=6, minSize=(min_sz, min_sz))
            boxes = sorted([[int(x), int(y), int(bw), int(bh)] for (x, y, bw, bh) in det],
                           key=lambda b: -(b[2] * b[3]))
            kept: list[list[int]] = []
            for b in boxes:
                if all(_containment(b, k) < 0.5 for k in kept):
                    kept.append(b)
            if kept:
                pi = _pick_primary(kept, session.candidate_bbox, w)
                ordered = [kept[pi]] + [b for i, b in enumerate(kept) if i != pi]
                for i, b in enumerate(ordered):
                    out["boxes"].append({"x": b[0], "y": b[1], "w": b[2], "h": b[3], "label": "",
                                         "is_primary": i == 0, "status": "verified" if i == 0 else "flagged",
                                         "source": "haar"})
        except Exception as e:  # noqa: BLE001
            logger.warning("anti_cheat: Haar cascade error: %s", e)
    return out


# ---------------------------------------------------------------------------
# YOLOv8 object / person detection
# ---------------------------------------------------------------------------
# class id -> (label, severity, description, min_conf)
_PROHIBITED_CLASSES = {
    67: ("cell phone", "HIGH", "📱 Mobile phone detected", 0.35),
    73: ("book", "MEDIUM", "📖 Reference book/notes detected", 0.40),
    63: ("laptop", "MEDIUM", "💻 Secondary screen/laptop detected", 0.50),
    65: ("remote/controller", "HIGH", "📱 Handheld electronic device detected", 0.45),
}


def _run_yolo_detection(frame: np.ndarray, frame_w: int, frame_h: int) -> dict[str, Any]:
    yolo = _get_yolo_model()
    empty = {"objects": [], "people_count": 0, "prohibited": [], "persons": []}
    if yolo is None:
        return empty
    try:
        with _infer_lock:
            results = yolo(frame, device="cpu", verbose=False, conf=0.25, iou=0.5, imgsz=480)
        boxes = results[0].boxes if results and len(results) > 0 else []

        persons: list[dict[str, Any]] = []
        prohibited: list[dict[str, Any]] = []
        for box in boxes:
            cls_id = int(box.cls[0].item())
            conf = float(box.conf[0].item())
            x1, y1, x2, y2 = [int(v) for v in box.xyxy[0].tolist()]
            if cls_id == 0:
                area = max(0, x2 - x1) * max(0, y2 - y1)
                if conf >= 0.45 and area >= 0.03 * frame_w * frame_h:
                    persons.append({"class": "person", "confidence": round(conf, 2),
                                    "bbox": [x1, y1, x2, y2], "flagged": False})
            elif cls_id in _PROHIBITED_CLASSES:
                name, sev, desc, min_conf = _PROHIBITED_CLASSES[cls_id]
                if conf >= min_conf:
                    prohibited.append({"class": name, "severity": sev, "confidence": round(conf, 2),
                                       "description": desc, "bbox": [x1, y1, x2, y2], "flagged": True})

        # de-duplicate fragmented / overlapping person boxes (keep the larger)
        persons.sort(key=lambda p: -((p["bbox"][2] - p["bbox"][0]) * (p["bbox"][3] - p["bbox"][1])))
        kept: list[dict[str, Any]] = []
        for p in persons:
            xywh = [p["bbox"][0], p["bbox"][1], p["bbox"][2] - p["bbox"][0], p["bbox"][3] - p["bbox"][1]]
            dup = False
            for k in kept:
                kx = [k["bbox"][0], k["bbox"][1], k["bbox"][2] - k["bbox"][0], k["bbox"][3] - k["bbox"][1]]
                if _containment(xywh, kx) > 0.7:
                    dup = True
                    break
            if not dup:
                kept.append(p)
        return {"objects": kept + prohibited, "people_count": len(kept), "prohibited": prohibited, "persons": kept}
    except Exception as e:  # noqa: BLE001
        logger.warning("YOLO detection error: %s", e)
        return empty


# ---------------------------------------------------------------------------
# Multi-person strike policy
# ---------------------------------------------------------------------------
def _register_strike(session: SessionState, now: float, persons: int) -> None:
    session.multi_face_strikes += 1
    session.last_multi_face_strike_time = now
    session.strike_records.append({
        "strike": session.multi_face_strikes,
        "timestamp": datetime.fromtimestamp(now, tz=timezone.utc).strftime("%H:%M:%S"),
        "persons_count": persons,
        "detail": f"Strike {session.multi_face_strikes}/3: Multiple persons ({persons}) observed in examination frame.",
    })
    if session.multi_face_strikes >= 3:
        session.terminated_for_cheating = True
        session.negative_marking_applied = True
        session.integrity_score = 0


# ---------------------------------------------------------------------------
# Main pipeline
# ---------------------------------------------------------------------------
def _decode_frame(frame_b64: str):
    clean = frame_b64.split(",", 1)[1] if "," in frame_b64 else frame_b64
    clean = "".join(clean.split())
    clean += "=" * (-len(clean) % 4)
    img_bytes = base64.b64decode(clean)
    return cv2.imdecode(np.frombuffer(img_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)


def analyze_frame(
    frame_b64: str,
    session_id: str | None = None,
    timestamp: float | None = None,
    transcript: str = "",
) -> dict[str, Any]:
    now = float(timestamp) if timestamp else time.time()
    if now > 1e11:  # client sent milliseconds
        now /= 1000.0

    session = get_or_create_session(session_id)
    session.frame_count += 1
    session.latest_frame_b64 = frame_b64
    session.latest_transcript = transcript or session.latest_transcript

    perf = time.perf_counter()
    if session.last_perf:
        inst = 1.0 / max(1e-3, perf - session.last_perf)
        session.fps = inst if not session.fps else 0.7 * session.fps + 0.3 * inst
    session.last_perf = perf

    if cv2 is None or np is None:
        return _build_empty_response(session, "OpenCV is not available on the server.")

    try:
        frame = _decode_frame(frame_b64)
    except Exception as e:  # noqa: BLE001
        logger.warning("anti_cheat: Decode error: %s", e)
        return _build_empty_response(session, "Failed to decode camera frame.")
    if frame is None:
        return _build_empty_response(session, "Camera frame could not be read.")

    fh0, fw0 = frame.shape[:2]
    scale = MAX_WORK_DIM / float(max(fh0, fw0))
    work = cv2.resize(frame, (int(fw0 * scale), int(fh0 * scale)), interpolation=cv2.INTER_AREA) if scale < 1.0 else frame
    frame_h, frame_w = work.shape[:2]

    # ---- 1. Faces -------------------------------------------------------
    det = _detect_faces(work, session)
    face_boxes: list[dict[str, Any]] = det["boxes"]
    primary_lms = det["landmarks"]
    face_count = len(face_boxes)

    # Is the candidate's face inside the allowed zone?
    in_zone = True
    if face_boxes:
        in_zone = _face_in_zone(face_boxes[0], frame_w, frame_h, session.zone)

    # ---- 2. Pose / gaze (for the SAME face labelled Candidate) -----------
    head_pose: dict[str, Any] = {"yaw": 0.0, "pitch": 0.0, "roll": 0.0, "direction": "CENTER"}
    eye_gaze: dict[str, Any] = {"direction": "CENTER", "horizontal": "CENTER", "vertical": "CENTER", "diverted": False, "ratio": 0.50}
    micro_metrics: dict[str, Any] = {"mouth_open": False, "mouth_ratio": 0.0, "ear": 0.30}
    mesh_points: list[list[int]] = []
    calibrating = False

    # ---- 3. YOLO (cached, every Nth frame) ------------------------------
    fresh_yolo = False
    if _get_yolo_model() is not None and (
        not session.yolo_cache or session.frame_count - session.last_yolo_frame >= YOLO_EVERY_N_FRAMES
    ):
        session.yolo_cache = _run_yolo_detection(work, frame_w, frame_h)
        session.last_yolo_frame = session.frame_count
        fresh_yolo = True
    yolo_result = session.yolo_cache or {"objects": [], "people_count": 0, "prohibited": [], "persons": []}
    prohibited_objects = yolo_result["prohibited"]

    # Bodies not explained by any detected face = additional people (or the candidate turned away)
    unmatched_bodies: list[dict[str, Any]] = []
    for p in yolo_result.get("persons", []):
        px1, py1, px2, py2 = p["bbox"]
        margin = 0.15 * frame_h
        matched = any(
            px1 <= fb["x"] + fb["w"] / 2 <= px2 and (py1 - margin) <= fb["y"] + fb["h"] / 2 <= (py2 + margin)
            for fb in face_boxes
        )
        if not matched:
            unmatched_bodies.append(p)

    total_persons = face_count + len(unmatched_bodies)

    # Pose only when exactly the candidate's landmarks exist
    if primary_lms is not None:
        raw = _calculate_head_pose(primary_lms, frame_w, frame_h, session.smoothed_head_pose)
        if raw:
            session.smoothed_head_pose = {"yaw": raw["yaw"], "pitch": raw["pitch"], "roll": raw["roll"]}
            if (
                not session.calibrated
                and total_persons == 1
                and in_zone
                and abs(raw["yaw"]) < 35
                and abs(raw["pitch"]) < 35
            ):
                session.calib_samples.append((raw["yaw"], raw["pitch"]))
                if len(session.calib_samples) >= CALIB_FRAMES:
                    session.baseline_yaw = statistics.median(s[0] for s in session.calib_samples)
                    session.baseline_pitch = statistics.median(s[1] for s in session.calib_samples)
                    session.calibrated = True
            calibrating = not session.calibrated
            yaw_rel = raw["yaw"] - session.baseline_yaw if session.calibrated else 0.0
            pitch_rel = raw["pitch"] - session.baseline_pitch if session.calibrated else 0.0
            head_pose = {
                "yaw": round(yaw_rel, 1),
                "pitch": round(pitch_rel, 1),
                "roll": round(raw["roll"], 1),
                "direction": "CENTER" if calibrating else _classify_direction(yaw_rel, pitch_rel),
                "raw_yaw": round(raw["yaw"], 1),
                "raw_pitch": round(raw["pitch"], 1),
            }
        eye_gaze, micro_metrics = _calculate_eye_gaze_and_metrics(
            primary_lms, det["blendshapes"], head_yaw=head_pose["yaw"], head_pitch=head_pose["pitch"]
        )
        if calibrating:
            eye_gaze["diverted"] = False
        mesh_points = _extract_mesh_points(primary_lms, frame_w, frame_h)

    # ---- 4. Final labelling ----------------------------------------------
    if face_boxes:
        pb = face_boxes[0]
        pb["label"] = "Candidate"
        pb["is_primary"] = True
        pb["status"] = "verified" if head_pose["direction"] == "CENTER" else "flagged"
        session.candidate_bbox = (pb["x"], pb["y"], pb["w"], pb["h"])
        if not in_zone:
            pb["label"] = "Unidentified ⚠️"
            pb["is_primary"] = False
            pb["status"] = "flagged"
        for i, fb in enumerate(face_boxes[1:], start=2):
            fb["label"] = f"Person #{i} ⚠️"
            fb["is_primary"] = False
            fb["status"] = "flagged"

    display_boxes = list(face_boxes)
    for j, p in enumerate(sorted(unmatched_bodies, key=lambda q: -((q["bbox"][2] - q["bbox"][0]) * (q["bbox"][3] - q["bbox"][1])))):
        x1, y1, x2, y2 = p["bbox"]
        is_cand_body = face_count == 0 and j == 0
        display_boxes.append({
            "x": x1, "y": y1, "w": x2 - x1, "h": min(y2 - y1, int(frame_h * 0.65)),
            "label": "Candidate (Body)" if is_cand_body else f"Person #{face_count + j + 1} (Body) ⚠️",
            "is_primary": False, "status": "flagged", "source": "yolo",
        })

    active_violations: list[str] = []
    rule_status: dict[str, Any] = {}

    # ---- Rule 1: face presence --------------------------------------------
    if face_count == 0:
        session.streak_no_face += 1
        rule_status["face_detection"] = {"status": "FAIL", "rule": "1. Face detection",
                                         "message": "No candidate face visible in webcam"}
        if session.streak_no_face >= NO_FACE_CONFIRM_FRAMES:
            active_violations.append("no_face_detected")
    else:
        session.streak_no_face = 0
        rule_status["face_detection"] = {"status": "PASS", "rule": "1. Face detection",
                                         "message": "Candidate face verified and present"}

    # ---- Rule 2: multiple persons / 3-strike policy ---------------------------
    if total_persons > 1:
        session.streak_multi_face += 1
        if not session.multi_since:
            session.multi_since = now
        session.multi_last_seen = now
    else:
        session.streak_multi_face = 0
        if session.multi_episode_active:
            if now - session.multi_last_seen >= MULTI_CLEAR_SECONDS:
                session.multi_episode_active = False
                session.multi_since = 0.0
        else:
            session.multi_since = 0.0

    if not session.terminated_for_cheating:
        confirmed = (
            total_persons > 1
            and session.streak_multi_face >= MULTI_CONFIRM_FRAMES
            and (now - session.multi_since) >= MULTI_CONFIRM_SECONDS
        )
        if confirmed and not session.multi_episode_active:
            session.multi_episode_active = True
            _register_strike(session, now, total_persons)
        elif (
            session.multi_episode_active
            and total_persons > 1
            and now - session.last_multi_face_strike_time >= MULTI_REPEAT_SECONDS
        ):
            _register_strike(session, now, total_persons)

    if session.multi_episode_active or session.terminated_for_cheating:
        active_violations.append("multiple_faces")

    if total_persons > 1:
        rule_status["multiple_faces"] = {
            "status": "FAIL" if session.multi_episode_active else "WARN",
            "rule": "2. Multiple-face detection",
            "message": f"Multiple persons detected ({total_persons} in camera)",
            "count": total_persons,
            "strikes": session.multi_face_strikes,
        }
    else:
        rule_status["multiple_faces"] = {
            "status": "PASS",
            "rule": "2. Multiple-face detection",
            "message": "Single candidate verified in frame",
            "count": 1 if face_count == 1 else 0,
            "strikes": session.multi_face_strikes,
        }

    # ---- Rule 3: head pose -------------------------------------------------
    if head_pose["direction"] != "CENTER" and face_count > 0:
        session.streak_head_turned += 1
        direction_text = head_pose["direction"].lower()
        rule_status["head_pose"] = {
            "status": "WARN", "rule": "3. Head-pose estimation",
            "message": f"Candidate head turned {direction_text} away from screen",
            "direction": head_pose["direction"], "yaw": head_pose["yaw"], "pitch": head_pose["pitch"],
        }
        if session.streak_head_turned >= HEAD_CONFIRM_FRAMES:
            active_violations.append(f"head_turned_{direction_text}")
    else:
        session.streak_head_turned = 0
        rule_status["head_pose"] = {
            "status": "PASS", "rule": "3. Head-pose estimation",
            "message": "Calibrating neutral pose..." if calibrating and face_count > 0 else "Head orientation centered on monitor",
            "direction": "CENTER", "yaw": head_pose["yaw"], "pitch": head_pose["pitch"],
        }

    # ---- Rule 4: eye gaze ----------------------------------------------------
    if eye_gaze.get("diverted") and face_count > 0:
        session.streak_eye_diverted += 1
        rule_status["eye_gaze"] = {
            "status": "WARN", "rule": "4. Eye-gaze estimation",
            "message": f"Eyes diverted {eye_gaze['direction'].lower()} away from monitor",
            "direction": eye_gaze["direction"],
        }
        if session.streak_eye_diverted >= GAZE_CONFIRM_FRAMES:
            active_violations.append("eye_gaze_diverted")
    else:
        session.streak_eye_diverted = 0
        rule_status["eye_gaze"] = {"status": "PASS", "rule": "4. Eye-gaze estimation",
                                   "message": "Eye gaze focused on interview questions", "direction": "CENTER"}

    # ---- Rule 5: objects (streaks advance only on fresh YOLO runs) -----------------
    present = {o["class"] for o in prohibited_objects}
    if fresh_yolo:
        for c in present:
            session.obj_streaks[c] = session.obj_streaks.get(c, 0) + 1
        for c in list(session.obj_streaks):
            if c not in present:
                session.obj_streaks[c] = 0
    confirmed_objs = [c for c in present if session.obj_streaks.get(c, 0) >= OBJECT_CONFIRM_RUNS]
    for c in confirmed_objs:
        active_violations.append(f"{c.replace('/', '_').replace(' ', '_')}_detected")
    session.streak_phone = session.obj_streaks.get("cell phone", 0)
    session.streak_book = session.obj_streaks.get("book", 0)

    if prohibited_objects:
        rule_status["object_detection"] = {
            "status": "FAIL" if confirmed_objs else "WARN",
            "rule": "5. Object detection",
            "message": f"Unauthorized item visible: {', '.join(sorted(present))}",
            "objects": prohibited_objects,
        }
    else:
        rule_status["object_detection"] = {"status": "PASS", "rule": "5. Object detection",
                                           "message": "No mobile phones or prohibited items detected", "objects": []}

    # ---- Rule 6: face must stay inside the allowed zone -----------------------
    if face_count > 0 and not in_zone:
        session.streak_out_of_zone += 1
        rule_status["face_zone"] = {
            "status": "FAIL" if session.streak_out_of_zone >= ZONE_CONFIRM_FRAMES else "WARN",
            "rule": "6. Face zone",
            "message": "Face moved outside the allowed area - candidate unidentified",
            "zone": list(session.zone),
        }
        if session.streak_out_of_zone >= ZONE_CONFIRM_FRAMES:
            active_violations.append("face_out_of_zone")
    else:
        session.streak_out_of_zone = 0
        rule_status["face_zone"] = {
            "status": "PASS", "rule": "6. Face zone",
            "message": "Face inside the allowed area" if face_count > 0 else "No face to check",
            "zone": list(session.zone),
        }

    # ---- Severity & integrity score ---------------------------------------------------
    highest_severity = "NONE"
    alert_messages: list[str] = []
    for viol in active_violations:
        if "multiple_faces" in viol:
            sev, desc = "HIGH", f"Multiple people detected in frame (Strike {session.multi_face_strikes}/3)"
        elif "cell_phone" in viol:
            sev, desc = "HIGH", "Mobile phone detected in candidate hand or desk"
        elif "no_face" in viol:
            sev, desc = "MEDIUM", "Candidate face completely left the camera frame"
        elif "head_turned" in viol:
            sev, desc = "MEDIUM", f"Candidate repeatedly turning head away ({head_pose['direction']})"
        elif "eye_gaze" in viol:
            sev, desc = "LOW", "Eye gaze repeatedly looking away from questions"
        elif "face_out_of_zone" in viol:
            sev, desc = "MEDIUM", "Candidate unidentified: face moved outside the allowed area"
        else:
            sev, desc = "MEDIUM", f"Suspicious activity: {viol.replace('_', ' ')}"

        alert_messages.append(desc)
        if sev == "HIGH":
            highest_severity = "HIGH"
        elif sev == "MEDIUM" and highest_severity != "HIGH":
            highest_severity = "MEDIUM"
        elif sev == "LOW" and highest_severity == "NONE":
            highest_severity = "LOW"

        if viol not in session.active_events:
            session.active_events[viol] = ProctoringEvent(
                id=str(uuid.uuid4())[:8], rule=viol, event_type=viol.upper(), severity=sev,
                description=desc, started_at=now, last_seen_at=now,
            )
            penalty = 15 if sev == "HIGH" else 7 if sev == "MEDIUM" else 3
            if not session.terminated_for_cheating:
                session.integrity_score = max(0, session.integrity_score - penalty)
        else:
            ev = session.active_events[viol]
            ev.last_seen_at = now
            ev.duration_seconds = round(now - ev.started_at, 1)

    active_keys = set(active_violations)
    for key in list(session.active_events.keys()):
        if key not in active_keys:
            ev = session.active_events.pop(key)
            ev.active = False
            session.completed_events.append({
                "id": ev.id, "rule": ev.rule, "event_type": ev.event_type, "severity": ev.severity,
                "description": ev.description,
                "started_at": datetime.fromtimestamp(ev.started_at, tz=timezone.utc).strftime("%H:%M:%S"),
                "duration_seconds": ev.duration_seconds,
            })

    summary_msg = " · ".join(alert_messages[:2]) if alert_messages else "Proctoring active: 1 candidate face focused, room clear."

    primary_center_x = primary_center_y = 50.0
    if face_boxes:
        pf = face_boxes[0]
        primary_center_x = round(((pf["x"] + pf["w"] / 2) / frame_w) * 100, 1)
        primary_center_y = round(((pf["y"] + pf["h"] / 2) / frame_h) * 100, 1)

    telemetry_payload = {
        "head_pose": head_pose,
        "eye_gaze": eye_gaze,
        "micro_metrics": micro_metrics,
        "people_count": total_persons,
        "objects_count": len(yolo_result["objects"]),
        "strikes": session.multi_face_strikes,
        "fps_estimate": round(session.fps, 1),
        "calibrating": calibrating,
    }
    boxes_payload = {
        "faces": display_boxes,
        "objects": yolo_result["objects"],
        "mesh_points": mesh_points,
        "frame_w": frame_w,
        "frame_h": frame_h,
        "zone": {"x_min": session.zone[0], "y_min": session.zone[1],
                 "x_max": session.zone[2], "y_max": session.zone[3]},
    }
    session.latest_telemetry = telemetry_payload
    session.latest_boxes = boxes_payload

    negative_marking = None
    if session.terminated_for_cheating:
        negative_marking = {
            "penalty_score": -25,
            "status": "DISQUALIFIED",
            "verdict": "FAIL - Disqualified for Repeated Multiple Candidates Malpractice",
            "strike_records": session.strike_records,
            "incident_summary": (
                "Candidate detected with secondary unauthorized individuals in the examination room on 3 separate occasions. "
                "Automatic termination triggered under strict academic and interview proctoring guidelines."
            ),
        }

    mp_ok = _get_mediapipe_landmarker() is not None
    yolo_ok = _get_yolo_model() is not None
    base_conf = 0.40
    if primary_lms is not None:
        base_conf += 0.40
    elif face_boxes:
        base_conf += 0.15  # Haar-only detection
    if yolo_ok:
        base_conf += 0.10
    if _cv2_available:
        base_conf += 0.05
    if face_boxes and 30.0 <= primary_center_x <= 70.0 and 20.0 <= primary_center_y <= 80.0:
        base_conf += 0.04
    model_confidence = round(min(0.99, max(0.30, base_conf)), 2)

    return {
        "alert": len(active_violations) > 0 or session.terminated_for_cheating,
        "violations": active_violations,
        "severity": highest_severity if not session.terminated_for_cheating else "CRITICAL",
        "integrity_score": session.integrity_score,
        "message": summary_msg,
        "face_count": face_count,
        "persons_count": total_persons,
        "face_center_x_pct": primary_center_x,
        "face_center_y_pct": primary_center_y,
        "confidence": model_confidence,
        "models_used": {"mediapipe": mp_ok, "yolo": yolo_ok, "opencv": _cv2_available},
        "telemetry": telemetry_payload,
        "bounding_boxes": boxes_payload,
        "rules": rule_status,
        "multi_face_strikes": session.multi_face_strikes,
        "terminated": session.terminated_for_cheating,
        "negative_marking": negative_marking,
        "events_log": [
            {"id": ev.id, "rule": ev.rule, "event_type": ev.event_type, "severity": ev.severity,
             "description": ev.description, "duration_seconds": ev.duration_seconds, "active": True}
            for ev in session.active_events.values()
        ] + session.completed_events[-10:],
        "proctor_messages": session.proctor_messages[-5:],
    }


def _build_empty_response(session: SessionState, message: str) -> dict[str, Any]:
    return {
        "alert": False,
        "violations": [],
        "severity": "NONE",
        "integrity_score": session.integrity_score,
        "message": message,
        "face_count": 0,
        "persons_count": 0,
        "face_center_x_pct": 50.0,
        "face_center_y_pct": 50.0,
        "confidence": 0.0,
        "models_used": {"mediapipe": False, "yolo": False, "opencv": False},
        "telemetry": {
            "head_pose": {"yaw": 0.0, "pitch": 0.0, "roll": 0.0, "direction": "CENTER"},
            "eye_gaze": {"direction": "CENTER", "horizontal": "CENTER", "vertical": "CENTER"},
            "micro_metrics": {"mouth_open": False, "mouth_ratio": 0.0, "ear": 0.30},
            "people_count": 0,
            "objects_count": 0,
            "strikes": session.multi_face_strikes,
            "fps_estimate": 0,
            "calibrating": False,
        },
        "bounding_boxes": {"faces": [], "objects": [], "mesh_points": [], "frame_w": 640, "frame_h": 480,
                           "zone": {"x_min": session.zone[0], "y_min": session.zone[1],
                                    "x_max": session.zone[2], "y_max": session.zone[3]}},
        "rules": {},
        "multi_face_strikes": session.multi_face_strikes,
        "terminated": session.terminated_for_cheating,
        "negative_marking": None,
        "events_log": session.completed_events[-8:],
        "proctor_messages": session.proctor_messages[-5:],
    }