"use client";

/**
 * VideoInterview — Multi-Model AI Video Interview with Advanced Proctoring.
 *
 * Architecture:
 *  • Video Processing: Live WebRTC / MediaDevices video capture + canvas frame extraction
 *  • MediaPipe Face Landmarker: 3D head-pose (yaw/pitch/roll) + eye-gaze tracking
 *  • Ultralytics YOLOv8: Real-time cell phone, laptop, book, and multiple-person detection
 *  • Event Analysis Engine: Temporal smoothing across frames, 5 proctoring rules, severity ratings
 *  • Proctoring Dashboard: Live visual bounding boxes, real-time HUD telemetry, event log, audit report
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Award,
  Ban,
  BookOpen,
  Camera,
  CameraOff,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Cpu,
  Eye,
  EyeOff,
  HelpCircle,
  History,
  Layers,
  ListChecks,
  Loader2,
  Mic,
  MicOff,
  Phone,
  Radio,
  RefreshCw,
  Send,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Square,
  Users,
  Video,
  Volume2,
  X,
} from "lucide-react";

// ─── Browser speech types (not in default TS DOM lib) ────────────────────────
type SpeechAlternative = { transcript: string };
type SpeechResult = { isFinal: boolean; length: number; [index: number]: SpeechAlternative };
type SpeechResultList = { length: number; [index: number]: SpeechResult };
type SpeechEvent = { resultIndex: number; results: SpeechResultList };
type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => RecognitionLike;

// ─── Types ────────────────────────────────────────────────────────────────────

type InterviewQuestion = {
  id?: string;
  prompt: string;
  topic: string;
  why?: string;
};

type Evaluation = {
  overall: number;
  dimensions: Record<string, number>;
  strengths: string[];
  improvements: string[];
  follow_up?: string;
};

type AnswerRecord = {
  question: InterviewQuestion;
  answer: string;
  evaluation: Evaluation;
  cheatingFlags: string[];
  integrityScoreAtTime: number;
};

type BoundingBoxFace = {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  is_primary: boolean;
  status: "verified" | "flagged";
};

type BoundingBoxObject = {
  class: string;
  severity?: "LOW" | "MEDIUM" | "HIGH";
  confidence: number;
  description?: string;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2]
  flagged: boolean;
};

type ProctoringEvent = {
  id: string;
  rule: string;
  event_type: string;
  severity: "LOW" | "MEDIUM" | "HIGH";
  description: string;
  started_at?: string;
  duration_seconds?: number;
  active?: boolean;
};

type AntiCheatResult = {
  alert: boolean;
  violations: string[];
  severity: "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  integrity_score: number;
  message: string;
  face_count: number;
  face_center_x_pct: number;
  face_center_y_pct: number;
  confidence: number;
  models_used: { mediapipe: boolean; yolo: boolean; opencv: boolean };
  telemetry: {
    head_pose: { yaw: number; pitch: number; roll: number; direction: string };
    eye_gaze: { direction: string; horizontal: string; vertical: string; diverted?: boolean; ratio?: number };
    micro_metrics?: { mouth_open: boolean; mouth_ratio: number; ear: number };
    people_count: number;
    objects_count: number;
    strikes?: number;
  };
  bounding_boxes: {
    faces: BoundingBoxFace[];
    objects: BoundingBoxObject[];
    mesh_points?: Array<[number, number]>;
    frame_w: number;
    frame_h: number;
  };
  rules: Record<
    string,
    { status: "PASS" | "WARN" | "FAIL"; rule: string; message: string; count?: number; direction?: string; yaw?: number; pitch?: number; strikes?: number }
  >;
  multi_face_strikes?: number;
  terminated?: boolean;
  negative_marking?: {
    penalty_score: number;
    status: string;
    verdict: string;
    strike_records: Array<{ strike: number; timestamp: string; persons_count: number; detail: string }>;
    incident_summary: string;
  } | null;
  events_log: ProctoringEvent[];
  proctor_messages?: Array<{ id: string; sender: string; message: string; timestamp: string }>;
};

type SessionPhase =
  | "setup"
  | "countdown"
  | "question"
  | "answering"
  | "evaluating"
  | "complete"
  | "terminated";

// ─── Constants ─────────────────────────────────────────────────────────────────

const FRAME_INTERVAL_MS = 1400; // how often to analyze frame
const ALERT_COOLDOWN_MS = 4000; // minimum ms between audio warnings

// ─── Helpers ──────────────────────────────────────────────────────────────────

function captureFrameB64(video: HTMLVideoElement, canvas: HTMLCanvasElement): string {
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.7).split(",")[1] ?? "";
}

// ─── Topic Catalog & Dynamic Question Banks (15 Questions Per Topic) ─────────

export const TOPIC_OPTIONS = [
  { id: "Frontend Engineer", label: "Frontend Engineer", tag: "React, Next.js, CSS, Performance", icon: "💻" },
  { id: "Backend Developer", label: "Backend Developer", tag: "APIs, Databases, Caching, Concurrency", icon: "⚙️" },
  { id: "Full Stack Engineer", label: "Full Stack Engineer", tag: "End-to-End, Architecture, DB & Security", icon: "🌐" },
  { id: "AI & Machine Learning", label: "AI & Machine Learning", tag: "LLMs, Transformers, RAG, PyTorch", icon: "🤖" },
  { id: "Data Science & Analytics", label: "Data Science", tag: "Statistics, EDA, A/B Testing, SQL", icon: "📊" },
  { id: "DevOps & Cloud SRE", label: "DevOps & Cloud", tag: "Kubernetes, Docker, CI/CD, Terraform", icon: "☁️" },
  { id: "System Design & Architecture", label: "System Design", tag: "Distributed Systems, Sharding, CAP", icon: "🏗️" },
  { id: "Behavioral & STAR Leadership", label: "Behavioral & STAR", tag: "Conflict, Ownership, Ambiguity", icon: "🎯" },
  { id: "HR & Culture Fit", label: "HR & Culture", tag: "Motivation, Growth, Teamwork", icon: "🤝" },
];

const CLIENT_TOPIC_BANKS: Record<string, Array<{ prompt: string; topic: string; why: string }>> = {
  frontend: [
    { prompt: "Explain how the browser rendering pipeline works from HTML parsing, CSSOM construction, layout, paint to compositing.", topic: "Browser Internals", why: "Tests core understanding of browser rendering lifecycle." },
    { prompt: "What is the difference between Client-Side Rendering (CSR), Server-Side Rendering (SSR), and Static Site Generation (SSG)?", topic: "Rendering Architecture", why: "Assesses architectural trade-offs in modern web frameworks." },
    { prompt: "How does the JavaScript Event Loop handle microtasks versus macrotasks? Provide a concrete code example.", topic: "JavaScript Runtime", why: "Probes deep understanding of async scheduling and execution." },
    { prompt: "How do you identify, measure, and fix unnecessary re-renders in a complex React component tree?", topic: "Performance Optimization", why: "Tests ability to write scalable and performant UI components." },
    { prompt: "Compare global state managers like Redux or Zustand with React Context and server caches like React Query.", topic: "State Management", why: "Assesses state architecture knowledge for production apps." },
    { prompt: "How would you optimize Core Web Vitals such as Largest Contentful Paint (LCP) and Cumulative Layout Shift (CLS)?", topic: "Web Performance", why: "Evaluates real-world performance metrics and optimization techniques." },
    { prompt: "What security measures do you implement on the frontend to defend against Cross-Site Scripting (XSS) and clickjacking?", topic: "Web Security", why: "Tests security vigilance on the client side." },
    { prompt: "How do you implement Web Content Accessibility Guidelines (WCAG 2.1 AA) in interactive components like modals and dropdowns?", topic: "Accessibility (a11y)", why: "Evaluates inclusive design and accessible markup." },
    { prompt: "How do you approach responsive design across multiple device form factors and handle touch gestures vs mouse events?", topic: "Responsive Design", why: "Tests modern CSS layout mastery and device adaptability." },
    { prompt: "How do code-splitting, tree-shaking, and lazy loading improve initial bundle loading times in bundlers like Vite or Webpack?", topic: "Bundling & Tooling", why: "Assesses modern frontend build pipeline knowledge." },
    { prompt: "How does React's virtual DOM diffing algorithm work, and why are stable keys essential in lists?", topic: "React Internals", why: "Tests framework fundamentals and reconciliation heuristics." },
    { prompt: "How would you design an offline-first progressive web application using Service Workers and IndexedDB?", topic: "PWA Architecture", why: "Probes offline resilience and background sync capabilities." },
    { prompt: "Describe your step-by-step approach to diagnosing and resolving a persistent client-side memory leak.", topic: "Debugging & Profiling", why: "Evaluates practical profiling and memory management skills." },
    { prompt: "How do you handle network resilience, retry mechanisms, and optimistic UI updates for slow mobile connections?", topic: "Network Resilience", why: "Assesses user experience design under unstable network conditions." },
    { prompt: "How do you structure an enterprise Design System component library with TypeScript for strict type safety and reusability?", topic: "Component Architecture", why: "Evaluates design system scalability and TypeScript rigor." },
  ],
  backend: [
    { prompt: "When would you choose a relational database like PostgreSQL over a document store like MongoDB, and vice versa?", topic: "Database Architecture", why: "Evaluates data modeling and persistence trade-offs." },
    { prompt: "How do B-Tree indexes speed up query lookups, and what write performance trade-offs do they introduce?", topic: "Database Indexing", why: "Assesses query optimization and storage engine mechanics." },
    { prompt: "Explain ACID transaction isolation levels and compare them with the BASE consistency model in distributed databases.", topic: "Data Consistency", why: "Tests foundational data integrity principles." },
    { prompt: "How would you design a distributed rate limiter to protect public API endpoints from abuse and DDoS attacks?", topic: "API Security", why: "Evaluates defensive API architecture and distributed state management." },
    { prompt: "Compare REST, GraphQL, and gRPC. What factors determine which protocol you select for inter-service communication?", topic: "Protocols & APIs", why: "Tests knowledge of API transport protocols and serialization tradeoffs." },
    { prompt: "How does Redis handle in-memory persistence and what strategies do you use for safe cache invalidation?", topic: "Caching Systems", why: "Assesses caching best practices and data coherence." },
    { prompt: "What is the difference between synchronous blocking I/O, asynchronous non-blocking I/O, and worker thread concurrency?", topic: "Concurrency Models", why: "Evaluates server runtime and threading model comprehension." },
    { prompt: "How do message brokers like Apache Kafka ensure message ordering and partitioned consumer scalability?", topic: "Event Streaming", why: "Tests event streaming and distributed queue architecture." },
    { prompt: "Explain how JSON Web Tokens work and how you handle token revocation, blacklisting, or refresh rotation safely.", topic: "Authentication", why: "Probes secure authentication protocol design." },
    { prompt: "A microservice in production is experiencing sudden latency spikes. Walk me through your diagnostic workflow.", topic: "Production Debugging", why: "Evaluates observability and troubleshooting under pressure." },
    { prompt: "How do you prevent SQL injection, server-side request forgery (SSRF), and timing attacks in backend services?", topic: "Backend Security", why: "Tests secure coding standards and vulnerability prevention." },
    { prompt: "How do you execute database schema migrations without incurring downtime in continuous deployment systems?", topic: "Zero-Downtime Deployments", why: "Assesses schema versioning and deployment automation." },
    { prompt: "What are circuit breakers in distributed systems and how do they prevent cascading microservice outages?", topic: "Fault Tolerance", why: "Evaluates resilience patterns during dependency failures." },
    { prompt: "How do you structure distributed tracing with OpenTelemetry to track requests traversing multiple microservices?", topic: "Distributed Tracing", why: "Tests observability and performance bottleneck diagnosis." },
    { prompt: "Explain the CAP theorem and describe an architecture where you chose availability over strong consistency.", topic: "Distributed Systems", why: "Tests deep theoretical and practical distributed systems judgment." },
  ],
  fullstack: [
    { prompt: "Walk through an end-to-end request: from browser DNS lookup and TLS handshake to server routing, DB query, and UI render.", topic: "Full Stack Architecture", why: "Tests comprehensive understanding of the complete web ecosystem." },
    { prompt: "How do you architect real-time bi-directional data flow using WebSockets, Server-Sent Events, or long-polling?", topic: "Real-Time Systems", why: "Assesses protocol trade-offs for real-time collaboration." },
    { prompt: "How do you securely manage authentication sessions across Single Page Applications and multiple backend services?", topic: "Auth Architecture", why: "Evaluates secure cookie vs bearer token design." },
    { prompt: "How do you handle server-side rendering (SSR) data hydration without content flashing or degrading time-to-interactive?", topic: "Hydration & SSR", why: "Tests modern full-stack frontend-backend synchronization." },
    { prompt: "What is your automated testing pyramid: how do you balance unit tests, integration tests, and end-to-end browser tests?", topic: "Quality Engineering", why: "Evaluates testing strategy and CI/CD confidence." },
    { prompt: "How would you design a scalable image and document upload pipeline with direct-to-cloud uploads and CDN caching?", topic: "Cloud Architecture", why: "Tests cloud storage (S3/GCS) and CDN integration patterns." },
    { prompt: "How do you prevent XSS, CSRF, and SQL injection vulnerabilities across both client and server boundaries?", topic: "Full Stack Security", why: "Evaluates defense-in-depth security mindset." },
    { prompt: "How do you design database schemas, use ORMs safely, and diagnose and resolve the classic N+1 query problem?", topic: "Data Layer", why: "Assesses database query performance and ORM pitfalls." },
    { prompt: "What CI/CD pipelines have you built for automated linting, test suites, Docker image building, and automated rollouts?", topic: "DevOps & CI/CD", why: "Tests deployment automation and release reliability." },
    { prompt: "How would you build a high-performance full-text search feature for millions of documents without database locks?", topic: "Search Architecture", why: "Evaluates dedicated search engines like Elasticsearch or Postgres tsvector." },
    { prompt: "How do you manage environment secrets securely between local development, staging environments, and production?", topic: "Secret Management", why: "Assesses security hygiene and config management." },
    { prompt: "Describe a critical production bug you fixed that required investigating both client network traces and server error logs.", topic: "Cross-Stack Debugging", why: "Evaluates holistic problem-solving across stack boundaries." },
    { prompt: "How do you use feature flags to safely roll out new features to a small percentage of users and roll back quickly?", topic: "Release Engineering", why: "Tests progressive rollout strategies." },
    { prompt: "How do you design RESTful or GraphQL APIs that remain strictly backwards compatible as client requirements evolve?", topic: "API Evolution", why: "Evaluates contract stability and deprecation strategy." },
    { prompt: "What are the trade-offs between monolithic full-stack applications versus decoupled microservice architectures?", topic: "Architecture Strategy", why: "Assesses architectural judgment for team size and scale." },
  ],
  aiml: [
    { prompt: "Explain the bias-variance tradeoff and how L1 and L2 regularization techniques mathematically constrain model weights.", topic: "ML Foundations", why: "Tests statistical learning foundations and regularization mechanics." },
    { prompt: "How does the Self-Attention mechanism in Transformer architectures compute attention weights across tokens?", topic: "Deep Learning & Transformers", why: "Assesses modern neural network architectural knowledge." },
    { prompt: "What is the difference between Retrieval-Augmented Generation (RAG) and model fine-tuning? When would you choose each?", topic: "GenAI & LLMs", why: "Evaluates contemporary generative AI deployment decisions." },
    { prompt: "How do you detect and handle covariate shift and concept drift in production machine learning models?", topic: "MLOps & Monitoring", why: "Tests production model reliability and lifecycle management." },
    { prompt: "Explain precision, recall, F1-score, and ROC-AUC. Which metric would you prioritize for an imbalanced fraud detector?", topic: "Evaluation Metrics", why: "Evaluates metric selection for business problems." },
    { prompt: "How does backpropagation compute gradients through neural layers using the chain rule?", topic: "Neural Optimization", why: "Assesses mathematical rigor in optimization." },
    { prompt: "What strategies do you use to mitigate hallucination and factual inconsistency in Large Language Model responses?", topic: "LLM Safety & Alignment", why: "Tests prompt engineering, grounding, and verification methods." },
    { prompt: "How do parameter-efficient fine-tuning techniques like LoRA and QLoRA reduce GPU memory overhead during training?", topic: "Efficient Fine-Tuning", why: "Evaluates practical LLM training economics." },
    { prompt: "How do you handle severely imbalanced datasets during training using sampling and focal loss techniques?", topic: "Data Engineering", why: "Tests data preprocessing and loss formulation." },
    { prompt: "Explain how vector embeddings work and how vector databases index embeddings using algorithms like HNSW.", topic: "Vector Search", why: "Evaluates semantic search and retrieval systems." },
    { prompt: "How do you optimize deep learning model inference speed using quantization, pruning, and ONNX or TensorRT?", topic: "Inference Optimization", why: "Assesses model compression and deployment efficiency." },
    { prompt: "What is gradient clipping and why is it essential when training recurrent neural networks or deep Transformers?", topic: "Training Stability", why: "Tests training stability and numerical issues." },
    { prompt: "How do you validate an ML model to prevent data leakage between training and validation splits?", topic: "Validation Strategy", why: "Probes scientific rigor in experimental design." },
    { prompt: "What are the core differences between contrastive learning and masked language modeling?", topic: "Self-Supervised Learning", why: "Evaluates modern representation learning methodologies." },
    { prompt: "How would you design an end-to-end MLOps pipeline from data ingestion to automated model retraining and shadow testing?", topic: "MLOps Architecture", why: "Tests production machine learning system design." },
  ],
  datascience: [
    { prompt: "How do you structure exploratory data analysis (EDA) when receiving an unfamiliar 10-million-row dataset?", topic: "Exploratory Analysis", why: "Evaluates initial investigative data rigor." },
    { prompt: "Explain the Central Limit Theorem and why it is fundamental to statistical hypothesis testing.", topic: "Statistics & Probability", why: "Assesses theoretical statistical foundation." },
    { prompt: "How would you design and analyze an A/B test for a major product change? How do you calculate required sample size?", topic: "Experimentation", why: "Tests experiment design and significance calculation." },
    { prompt: "How do you detect and treat missing data (MCAR, MAR, MNAR) and extreme outliers without biasing your conclusions?", topic: "Data Cleaning", why: "Evaluates statistical data imputation techniques." },
    { prompt: "What is Principal Component Analysis (PCA) and how does it reduce dimensionality while preserving maximum variance?", topic: "Dimensionality Reduction", why: "Assesses mathematical and linear algebra understanding." },
    { prompt: "Compare tree-based models like XGBoost and LightGBM with linear models. When does gradient boosting outperform?", topic: "Modeling Algorithms", why: "Evaluates algorithm selection and ensemble methods." },
    { prompt: "How do you communicate complex statistical findings and uncertainty intervals to non-technical executive stakeholders?", topic: "Data Storytelling", why: "Assesses stakeholder communication and visualization skills." },
    { prompt: "Explain how SHAP (Shapley Additive exPlanations) values provide local and global model interpretability.", topic: "Model Interpretability", why: "Tests explainable AI knowledge for regulatory compliance." },
    { prompt: "How do you handle multicollinearity among independent variables in regression analysis?", topic: "Feature Engineering", why: "Probes diagnostic regression methods and VIF calculation." },
    { prompt: "What SQL window functions (like ROW_NUMBER, RANK, and LAG/LEAD) have you used to solve intricate analytical queries?", topic: "Advanced SQL", why: "Evaluates analytical querying competence." },
    { prompt: "How do you prevent overfitting when tuning hyperparameters with cross-validation on time-series data?", topic: "Time-Series Validation", why: "Tests temporal validation splits without future lookahead." },
    { prompt: "What is the difference between Type I and Type II errors, and how do you calibrate significance thresholds based on risk?", topic: "Hypothesis Testing", why: "Assesses risk analysis and decision theory." },
    { prompt: "How do you build a cohort retention analysis to identify user churn drivers in SaaS applications?", topic: "Business Analytics", why: "Evaluates practical customer behavior analysis." },
    { prompt: "Explain Simpson's Paradox with an intuitive real-world data example.", topic: "Statistical Paradoxes", why: "Tests statistical intuition and confounding variable awareness." },
    { prompt: "How do you productionize a data science workflow using tools like Airflow, dbt, or Prefect?", topic: "Data Pipelines", why: "Assesses repeatable pipeline construction." },
  ],
  devops: [
    { prompt: "Explain the core differences between containerization with Docker and virtualization with hypervisors.", topic: "Containers", why: "Evaluates foundational container knowledge." },
    { prompt: "How does Kubernetes manage pod scheduling, service discovery, and zero-downtime rolling updates?", topic: "Kubernetes", why: "Tests container orchestration expertise." },
    { prompt: "What is Infrastructure as Code (IaC) and what are the benefits of declarative tools like Terraform over imperative scripts?", topic: "Infrastructure as Code", why: "Assesses reproducible cloud infrastructure practices." },
    { prompt: "How do you design a secure CI/CD pipeline with automated vulnerability scanning, secret detection, and staging gates?", topic: "CI/CD Security", why: "Evaluates DevSecOps best practices." },
    { prompt: "Explain the difference between Blue-Green deployments and Canary releases. How do you implement automated rollback?", topic: "Deployment Strategies", why: "Tests release risk management and traffic splitting." },
    { prompt: "How would you architect a high-availability VPC across multiple cloud availability zones with public and private subnets?", topic: "Cloud Networking", why: "Evaluates cloud networking and network isolation." },
    { prompt: "What is GitOps and how do tools like ArgoCD or Flux keep cluster state synchronized with Git repositories?", topic: "GitOps", why: "Assesses modern Kubernetes delivery pipelines." },
    { prompt: "How do you establish monitoring, alerting, and SLA thresholds using Prometheus and Grafana without alert fatigue?", topic: "Observability", why: "Evaluates production observability standards." },
    { prompt: "A critical service pod is in CrashLoopBackOff in your production cluster. Walk through your debugging procedure.", topic: "Kubernetes Troubleshooting", why: "Tests operational debugging under pressure." },
    { prompt: "How do you manage cloud infrastructure secrets securely using HashiCorp Vault, AWS Secrets Manager, or Sealed Secrets?", topic: "Secret Management", why: "Assesses security hygiene and key rotation." },
    { prompt: "What is Chaos Engineering and how do experiments with tools like Chaos Mesh enhance system resilience?", topic: "Resilience Testing", why: "Tests proactive failure testing mindset." },
    { prompt: "How do you optimize cloud compute and storage costs (FinOps) in Kubernetes clusters with autoscaling?", topic: "Cloud Cost Optimization", why: "Evaluates resource utilization and auto-scaling policies." },
    { prompt: "Explain mutual TLS (mTLS) and how service meshes like Istio or Linkerd secure inter-service traffic.", topic: "Service Mesh & Security", why: "Tests zero-trust network architectures." },
    { prompt: "How do you formulate and test a comprehensive Disaster Recovery (DR) plan with defined RTO and RPO targets?", topic: "Disaster Recovery", why: "Assesses business continuity planning." },
    { prompt: "What are Linux cgroups and namespaces, and how do they enforce resource limits and process isolation in Docker?", topic: "Linux Internals", why: "Tests deep systems engineering fundamentals." },
  ],
  systemdesign: [
    { prompt: "How would you design a URL shortening service like TinyURL that handles 100 million new URLs per month?", topic: "System Architecture", why: "Evaluates end-to-end high-scale service design." },
    { prompt: "Explain consistent hashing and how it enables distributed caching and database sharding without mass re-indexing.", topic: "Distributed Hashing", why: "Tests distributed data distribution algorithms." },
    { prompt: "How do you scale a relational database horizontally using read replicas, sharding keys, and connection pooling?", topic: "Database Scaling", why: "Assesses database scalability bottlenecks." },
    { prompt: "What are the trade-offs between Layer 4 and Layer 7 load balancers? When would you use round-robin vs least connections?", topic: "Load Balancing", why: "Evaluates network traffic distribution strategies." },
    { prompt: "How would you design a real-time collaborative document editing system like Google Docs using OT or CRDTs?", topic: "Real-Time Collaboration", why: "Tests concurrency and conflict resolution algorithms." },
    { prompt: "How do you design an asynchronous notification system supporting email, SMS, and push notifications with retry queues?", topic: "Event Architecture", why: "Evaluates message queuing, deduplication, and dead-letter handling." },
    { prompt: "What caching strategies (Cache-Aside, Write-Through, Write-Back, Write-Around) would you use for a high-read news feed?", topic: "Caching Strategies", why: "Assesses cache hierarchy and eviction policies." },
    { prompt: "How would you design a distributed unique ID generator like Twitter Snowflake with high throughput and monotonicity?", topic: "Distributed Systems", why: "Tests coordination-free ID generation mechanisms." },
    { prompt: "Explain the CAP theorem and PACELC theorem with practical architecture choices you have made.", topic: "Architectural Theorems", why: "Evaluates theoretical tradeoffs in distributed design." },
    { prompt: "How would you architect a distributed rate-limiter across multiple worldwide edge regions using Redis or Token Bucket?", topic: "Rate Limiting at Scale", why: "Tests distributed state synchronization." },
    { prompt: "How do you design a search autocomplete system that returns instant suggestions within 20 milliseconds?", topic: "Low-Latency Systems", why: "Evaluates Trie data structures and edge caching." },
    { prompt: "What is database replication lag, how does it cause read-your-writes anomalies, and how do you prevent it?", topic: "Data Consistency", why: "Assesses eventual consistency mitigation." },
    { prompt: "How would you design an analytics ingestion pipeline capable of ingesting 50,000 events per second reliably?", topic: "Data Ingestion", why: "Tests streaming data architectures (Kafka, Flink, ClickHouse)." },
    { prompt: "How do you handle distributed transactions across multiple microservices using the Saga pattern (Choreography vs Orchestration)?", topic: "Distributed Transactions", why: "Tests compensating transaction design." },
    { prompt: "How would you design a CDN edge caching architecture for high-volume video and static media streaming?", topic: "Content Delivery", why: "Evaluates edge compute, caching, and origin shield patterns." },
  ],
  behavioural: [
    { prompt: "Describe a situation where project specifications changed drastically mid-sprint. How did you pivot?", topic: "Adaptability", why: "Evaluates adaptability to shifting business priorities." },
    { prompt: "Tell me about a time you identified a critical flaw before a release. How did you rally the team to address it?", topic: "Quality Ownership", why: "Tests proactive risk mitigation and influence." },
    { prompt: "Give an example of a time you had to deliver under ambiguous requirements without clear guidance.", topic: "Ambiguity", why: "Assesses autonomous decision-making and initiative." },
    { prompt: "Describe a scenario where team morale was low due to an outage or delay. What role did you play in keeping momentum?", topic: "Team Dynamics", why: "Evaluates peer leadership and empathy." },
    { prompt: "Tell me about a time you had to compromise on your ideal architectural solution to meet a business deadline.", topic: "Pragmatism", why: "Tests balance between engineering perfection and business reality." },
    { prompt: "Give an example of a successful cross-team collaboration where teams had competing priorities.", topic: "Collaboration", why: "Assesses cross-organizational negotiation and alignment." },
    { prompt: "Describe a time you made an incorrect assumption about user behavior. How did data correct your direction?", topic: "Data-Driven Mindset", why: "Tests humility and willingness to be guided by metrics." },
    { prompt: "Tell me about a time you advocated for an under-represented perspective or accessibility improvement.", topic: "Inclusivity", why: "Evaluates commitment to user advocacy and inclusive design." },
    { prompt: "Describe a situation where you resolved a bottleneck in your team's development or deployment process.", topic: "Process Improvement", why: "Tests continuous improvement and systems thinking." },
    { prompt: "Give an example of when you had to manage conflicting feedback from multiple senior stakeholders.", topic: "Stakeholder Management", why: "Evaluates diplomatic consensus building." },
    { prompt: "Tell me about a time you stepped outside your primary role to unblock a project or help a struggling peer.", topic: "Team Player", why: "Assesses selflessness and team-first attitude." },
    { prompt: "Describe an ethical dilemma or security tradeoff you faced in a software project and how you addressed it.", topic: "Integrity & Ethics", why: "Evaluates principled decision making." },
    { prompt: "Give an example of a time you turned a dissatisfied customer or client into a vocal advocate.", topic: "Customer Obsession", why: "Tests customer empathy and problem resolution." },
    { prompt: "Tell me about a project where you measured clear, quantifiable impact on business revenue or latency.", topic: "Impact & Results", why: "Assesses focus on tangible, measurable business outcomes." },
    { prompt: "Describe a moment you received public praise or recognition and how you shared credit with your team.", topic: "Humility & Recognition", why: "Evaluates team recognition and humility." },
  ],
  hr: [
    { prompt: "Walk me through your professional background and what specifically attracted you to this role.", topic: "Self-Introduction", why: "Evaluates career narrative, passion, and role alignment." },
    { prompt: "Describe a high-pressure deadline or emergency you faced at work. How did you prioritize tasks to succeed?", topic: "Pressure & Deadlines", why: "Tests composure and prioritization under pressure." },
    { prompt: "Tell me about a time you strongly disagreed with a colleague or manager's technical direction. How did you resolve it?", topic: "Conflict Resolution", why: "Evaluates emotional intelligence and constructive debate." },
    { prompt: "Describe a project that failed or did not meet expectations. What was your personal takeaway from that experience?", topic: "Resilience & Growth", why: "Tests self-awareness and learning from mistakes." },
    { prompt: "Give an example of a time you had to learn a completely new framework, language, or domain within days.", topic: "Adaptability", why: "Evaluates learning velocity and intellectual agility." },
    { prompt: "How do you handle receiving critical or tough feedback on your code or project delivery?", topic: "Receiving Feedback", why: "Tests openness to feedback and continuous self-improvement." },
    { prompt: "Describe a time you mentored a junior teammate or helped an onboarding colleague ramp up quickly.", topic: "Mentorship & Teamwork", why: "Assesses collaborative spirit and empathy." },
    { prompt: "How do you balance rapid delivery of new features with technical debt and code quality in agile sprints?", topic: "Engineering Values", why: "Evaluates pragmatic trade-offs between speed and quality." },
    { prompt: "Tell me about a situation where you had to communicate a complex technical limitation to a non-technical client or executive.", topic: "Stakeholder Communication", why: "Tests clarity and cross-disciplinary translation." },
    { prompt: "What kind of work environment and engineering culture empowers you to do your highest quality work?", topic: "Culture & Fit", why: "Assesses organizational compatibility." },
    { prompt: "Describe a time when you took initiative on an unassigned problem because it was the right thing for the product.", topic: "Ownership & Initiative", why: "Evaluates proactive leadership and ownership mindset." },
    { prompt: "How do you stay updated with emerging technologies and industry best practices alongside full-time work?", topic: "Continuous Learning", why: "Tests curiosity and professional dedication." },
    { prompt: "Tell me about a time you had to say 'no' to a feature request or scope creep. How did you manage expectations?", topic: "Boundary Management", why: "Assesses project scoping and diplomacy." },
    { prompt: "What are your primary professional growth goals over the next two to three years?", topic: "Long-Term Vision", why: "Evaluates career ambition and goal-setting." },
    { prompt: "Why should our engineering team hire you over other qualified candidates for this position?", topic: "Unique Value Proposition", why: "Tests confidence, clarity, and articulation of core strengths." },
  ],
};

function getClientTopicQuestions(roleOrTopic: string, count: number = 12): InterviewQuestion[] {
  const norm = (roleOrTopic || "").toLowerCase();
  let bank = CLIENT_TOPIC_BANKS.frontend;
  if (norm.includes("back")) bank = CLIENT_TOPIC_BANKS.backend;
  else if (norm.includes("full")) bank = CLIENT_TOPIC_BANKS.fullstack;
  else if (norm.includes("ai") || norm.includes("machine") || norm.includes("ml")) bank = CLIENT_TOPIC_BANKS.aiml;
  else if (norm.includes("data")) bank = CLIENT_TOPIC_BANKS.datascience;
  else if (norm.includes("devops") || norm.includes("cloud") || norm.includes("sre")) bank = CLIENT_TOPIC_BANKS.devops;
  else if (norm.includes("system") || norm.includes("design") || norm.includes("architect")) bank = CLIENT_TOPIC_BANKS.systemdesign;
  else if (norm.includes("behav") || norm.includes("star")) bank = CLIENT_TOPIC_BANKS.behavioural;
  else if (norm.includes("hr") || norm.includes("human")) bank = CLIENT_TOPIC_BANKS.hr;

  const shuffled = [...bank].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, Math.min(count, shuffled.length)).map((item, idx) => ({
    id: `q_${idx + 1}`,
    prompt: item.prompt,
    topic: item.topic,
    why: item.why,
  }));
}

function speak(text: string, onEnd?: () => void) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    onEnd?.();
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.96;
  let done = false;
  const finish = () => {
    if (!done) {
      done = true;
      onEnd?.();
    }
  };
  utterance.onend = finish;
  utterance.onerror = finish;
  const timer = setTimeout(finish, Math.max(3000, (text.length / 10) * 1000 + 1500));
  utterance.onend = () => {
    clearTimeout(timer);
    finish();
  };
  window.speechSynthesis.speak(utterance);
}

// ─── Visual Sub-Components ────────────────────────────────────────────────────

function AIAvatar({ speaking, role }: { speaking: boolean; role: string }) {
  return (
    <div className="flex flex-col items-center gap-2.5">
      <div
        className={`relative grid size-16 place-items-center rounded-2xl bg-gradient-to-tr from-[#7257df] to-[#9d8bf0] text-white shadow-md transition-all duration-300 ${
          speaking ? "ring-4 ring-[#8066e9]/40 scale-105" : ""
        }`}
      >
        <span className="text-2xl">🤖</span>
        {speaking && (
          <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full bg-[#38a169] text-[9px] font-bold text-white animate-pulse">
            ●
          </span>
        )}
      </div>
      <div className="text-center">
        <p className="text-xs font-semibold text-[#2d2640]">AI Interviewer</p>
        <p className="text-[10px] text-[#8f88a0]">Role: {role} · Proctored</p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function VideoInterview({
  jobRole,
  difficulty = "intermediate",
  onComplete,
  onBack,
}: {
  jobRole: string;
  difficulty?: string;
  onComplete?: (answers: AnswerRecord[], score: number) => void;
  onBack?: () => void;
}) {
  // Session & Phase
  const [phase, setPhase] = useState<SessionPhase>("setup");
  const [activeTopic, setActiveTopic] = useState<string>(jobRole || "Frontend Engineer");
  const [questionCount, setQuestionCount] = useState<number>(12);
  const [countdown, setCountdown] = useState(3);
  const [currentQ, setCurrentQ] = useState(0);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [sessionId] = useState<string>(() => `interview_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  const [answers, setAnswers] = useState<AnswerRecord[]>([]);
  const [answer, setAnswer] = useState("");
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [aiSpeaking, setAiSpeaking] = useState(false);
  const [activeTab, setActiveTab] = useState<"interview" | "proctor">("interview");

  // Camera & Mic
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);

  // Anti-Cheat Multi-Model Telemetry & Results
  const [antiCheatData, setAntiCheatData] = useState<AntiCheatResult | null>(null);
  const [allSessionEvents, setAllSessionEvents] = useState<ProctoringEvent[]>([]);
  const [lastAlertMs, setLastAlertMs] = useState(0);
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);
  const [showMesh, setShowMesh] = useState(true);
  const [strikes, setStrikes] = useState(0);
  const [proctorToast, setProctorToast] = useState<string | null>(null);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const isListeningRef = useRef(false);

  // Audio & Speech Recognition Telemetry
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micAnimRef = useRef<number | null>(null);
  const [micVolume, setMicVolume] = useState<number>(0);
  const finalTranscriptRef = useRef<string>("");
  const [interimText, setInterimText] = useState<string>("");
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [speechLang, setSpeechLang] = useState<string>("en-US");

  // ── Camera & Microphone Management ──────────────────────────────────────────

  const startCamera = useCallback(async () => {
    try {
      // Request camera AND microphone permissions so speech recognition has valid audio access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: "user" },
        audio: true,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraError(null);

      // Connect microphone stream to audio analyser for live audio volume meter
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack && typeof window !== "undefined") {
        try {
          const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
          if (AudioCtx) {
            const ctx = new AudioCtx();
            const source = ctx.createMediaStreamSource(new MediaStream([audioTrack]));
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 64;
            source.connect(analyser);
            audioContextRef.current = ctx;
            analyserRef.current = analyser;

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const checkVol = () => {
              if (!analyserRef.current) return;
              analyserRef.current.getByteFrequencyData(dataArray);
              let sum = 0;
              for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
              const avg = sum / dataArray.length;
              setMicVolume(Math.min(100, Math.round((avg / 128) * 100)));
              micAnimRef.current = requestAnimationFrame(checkVol);
            };
            checkVol();
          }
        } catch {}
      }
    } catch {
      // If combined audio/video fails, try video-only fallback
      try {
        const videoOnly = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480, facingMode: "user" },
          audio: false,
        });
        streamRef.current = videoOnly;
        if (videoRef.current) {
          videoRef.current.srcObject = videoOnly;
          await videoRef.current.play();
        }
        setCameraError(null);
      } catch {
        setCameraError("Camera or microphone access denied. Please allow camera and mic in browser address bar.");
      }
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (micAnimRef.current) cancelAnimationFrame(micAnimRef.current);
    try {
      audioContextRef.current?.close();
    } catch {}
    audioContextRef.current = null;
    analyserRef.current = null;
    setMicVolume(0);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  // ── Sync with Remote Interviewer / Proctor via BroadcastChannel ───────────
  useEffect(() => {
    if (typeof window === "undefined" || !("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel("skillbridge_interview_proctor");
    broadcastChannelRef.current = channel;

    channel.onmessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data) return;
      if (data.type === "PROCTOR_ACTION") {
        const { action, message } = data;
        if (action === "WARN") {
          setProctorToast(message || "Warning issued by lead proctor");
          speak(message || "Notice from proctor");
        } else if (action === "ADD_STRIKE") {
          setStrikes((prev) => {
            const next = prev + 1;
            if (next >= 3) {
              setPhase("terminated");
              stopCamera();
              speak("Third strike reached. Interview terminated with negative marking.");
            } else {
              speak(`Strike ${next} of 3 issued by proctor.`);
            }
            return next;
          });
        } else if (action === "TERMINATE") {
          setPhase("terminated");
          stopCamera();
          speak("Interview terminated by proctor for malpractice. Negative marking applied.");
        } else if (action === "RESET_STRIKES") {
          setStrikes(0);
          setProctorToast("Strikes have been cleared by proctor.");
        }
      }
    };

    return () => {
      channel.close();
    };
  }, [stopCamera]);

  useEffect(() => {
    if (phase !== "setup") void startCamera();
    return () => {
      if (phase === "complete" || phase === "terminated") stopCamera();
    };
  }, [phase, startCamera, stopCamera]);

  // ── Frame Analysis with YOLO & MediaPipe ────────────────────────────────────

  const analyzeFrame = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;
    if (videoRef.current.readyState < 2 || !cameraOn) return;

    const frameB64 = captureFrameB64(videoRef.current, canvasRef.current);
    if (!frameB64) return;

    try {
      const res = await fetch("/api/backend/interviews/anticheat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          frame_b64: frameB64,
          session_id: sessionId,
          timestamp: Date.now() / 1000,
        }),
      });

      if (!res.ok) return;
      const data = (await res.json()) as AntiCheatResult;
      setAntiCheatData(data);

      if (data.events_log?.length) {
        setAllSessionEvents(data.events_log);
      }

      // Check strikes updates from backend engine
      if (data.multi_face_strikes !== undefined) {
        setStrikes((prevStrikes) => {
          const currentStrikes = data.multi_face_strikes ?? 0;
          if (currentStrikes !== prevStrikes) {
            if (currentStrikes === 1) {
              speak("Warning: Strike 1 of 3. Multiple faces detected in frame. Ensure you are alone.");
            } else if (currentStrikes === 2) {
              speak("Critical warning: Strike 2 of 3. One more violation will immediately disqualify you.");
            } else if (currentStrikes >= 3) {
              speak("Strike 3 reached. Interview terminated for multiple candidate malpractice. Negative marking applied.");
            }
          }
          return currentStrikes;
        });
      }

      // 3-Strike Immediate Disqualification & Termination Trigger
      if (data.terminated || (data.multi_face_strikes ?? 0) >= 3) {
        setPhase("terminated");
        stopCamera();
      }

      // Voice notification on High or repeated violations with cooldown
      if (data.alert && (data.severity === "HIGH" || data.severity === "MEDIUM") && !data.terminated) {
        const now = Date.now();
        if (now - lastAlertMs > ALERT_COOLDOWN_MS) {
          if (data.violations.includes("cell_phone_detected")) {
            speak("Alert: Mobile phones are not permitted during the interview.");
          } else if (data.violations.some((v) => v.startsWith("head_turned"))) {
            speak("Please keep your eyes and face directed at the screen.");
          }
          setLastAlertMs(now);
        }
      }

      // Broadcast frame & telemetry to Proctor Command Center
      broadcastChannelRef.current?.postMessage({
        type: "CANDIDATE_FRAME_SYNC",
        sessionId,
        frameB64,
        telemetry: data.telemetry,
        boxes: data.bounding_boxes,
        strikes: data.multi_face_strikes ?? strikes,
        terminated: data.terminated || (data.multi_face_strikes ?? 0) >= 3,
        negative_marking: data.negative_marking,
        eventsLog: data.events_log,
        integrityScore: data.integrity_score,
        transcript: answer,
      });
    } catch {
      // Ignore transient network errors
    }
  }, [cameraOn, sessionId, lastAlertMs, strikes, answer, stopCamera]);

  useEffect(() => {
    if (phase !== "answering") {
      if (frameTimerRef.current) clearInterval(frameTimerRef.current);
      return;
    }
    frameTimerRef.current = setInterval(() => {
      void analyzeFrame();
    }, FRAME_INTERVAL_MS);
    return () => {
      if (frameTimerRef.current) clearInterval(frameTimerRef.current);
    };
  }, [phase, analyzeFrame]);

  // ── Speech Recognition ────────────────────────────────────────────────────

  // ── Speech Recognition (Continuous with Fresh Restart & Persistent Transcript) ──

  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    try {
      recognitionRef.current?.stop();
    } catch {}
    recognitionRef.current = null;
    setListening(false);
    setInterimText("");
  }, []);

  const startListening = useCallback(() => {
    isListeningRef.current = true;
    setSpeechError(null);

    if (typeof window === "undefined") return;
    const Win = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const Ctor = Win.SpeechRecognition || Win.webkitSpeechRecognition;
    if (!Ctor) {
      setSpeechError("Speech recognition is not supported in this browser. Chrome or Edge is recommended.");
      setListening(false);
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }

    try {
      const rec = new Ctor();
      rec.lang = speechLang || "en-US";
      rec.continuous = true;
      rec.interimResults = true;

      rec.onresult = (e: SpeechEvent) => {
        let currentInterim = "";
        let newFinal = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const item = e.results[i];
          const text = item?.[0]?.transcript ?? "";
          if (item?.isFinal) {
            newFinal += text + " ";
          } else {
            currentInterim += text;
          }
        }

        if (newFinal) {
          finalTranscriptRef.current = (finalTranscriptRef.current + " " + newFinal).replace(/\s+/g, " ").trim();
        }

        setInterimText(currentInterim);
        const combined = (finalTranscriptRef.current + (currentInterim ? " " + currentInterim : "")).replace(/\s+/g, " ").trim();
        setAnswer(combined);

        broadcastChannelRef.current?.postMessage({
          type: "CANDIDATE_TRANSCRIPT_UPDATE",
          transcript: combined,
        });
      };

      rec.onerror = (e: { error?: string }) => {
        const err = e?.error || "unknown";
        console.warn("Speech recognition notice:", err);
        if (err === "no-speech") {
          // Candidate paused or is thinking; do NOT abort listening
          return;
        }
        if (err === "not-allowed" || err === "service-not-allowed") {
          setSpeechError("Microphone permission was denied. Please allow microphone in your browser address bar.");
          isListeningRef.current = false;
          setListening(false);
        } else if (err === "audio-capture") {
          setSpeechError("Microphone audio capture failed. Check your input device.");
          isListeningRef.current = false;
          setListening(false);
        } else if (err === "network") {
          setSpeechError("Browser speech network glitch. You can speak again or type directly into the response box.");
        }
      };

      rec.onend = () => {
        // If candidate is still answering, start a brand-new instance cleanly!
        if (isListeningRef.current) {
          setTimeout(() => {
            if (isListeningRef.current) {
              startListening();
            }
          }, 100);
        } else {
          setListening(false);
          setInterimText("");
        }
      };

      rec.start();
      recognitionRef.current = rec;
      setListening(true);
    } catch (err) {
      console.error("Speech recognition startup error:", err);
      setListening(false);
    }
  }, [speechLang]);

  // ── Load Questions (10–15 Questions Based on Chosen Topic) ─────────────────

  const loadQuestions = useCallback(async (roleName = activeTopic, count = questionCount) => {
    setLoadingQuestions(true);
    try {
      const modeKey = roleName.toLowerCase().includes("hr")
        ? "hr"
        : roleName.toLowerCase().includes("behav")
        ? "behavioural"
        : roleName.toLowerCase().includes("system")
        ? "system_design"
        : "technical";

      const res = await fetch("/api/backend/interviews/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: roleName,
          mode: modeKey,
          difficulty,
          count,
          use_llm: true,
        }),
      });
      const data = (await res.json()) as { questions: InterviewQuestion[] };
      const qList = data.questions?.length ? data.questions : [];
      if (qList.length >= 5) {
        const slice = qList.slice(0, count);
        setQuestions(slice);
        return slice;
      }
    } catch {
      // Backend unavailable; use client-side curated bank
    } finally {
      setLoadingQuestions(false);
    }

    const fallback = getClientTopicQuestions(roleName, count);
    setQuestions(fallback);
    return fallback;
  }, [activeTopic, questionCount, difficulty]);

  // ── Begin Session (AI Reads First Question, Mic Opens Automatically) ───────

  const beginInterview = useCallback(async () => {
    setPhase("countdown");
    setCountdown(3);
    const qs = await loadQuestions(activeTopic, questionCount);

    let count = 3;
    const timer = setInterval(() => {
      count--;
      setCountdown(count);
      if (count <= 0) {
        clearInterval(timer);
        setPhase("question");
        setCurrentQ(0);
        setAnswer("");
        finalTranscriptRef.current = "";
        setInterimText("");
        stopListening();
        const firstQ = qs[0];
        if (firstQ) {
          setAiSpeaking(true);
          // AI reads the question aloud; when finished reading, mic opens automatically
          speak(firstQ.prompt, () => {
            setAiSpeaking(false);
            setPhase("answering");
            startListening();
          });
        }
      }
    }, 1000);
  }, [loadQuestions, activeTopic, questionCount, stopListening, startListening]);

  // ── Replay Question Prompt (AI Re-Reads Question, Mic Re-Opens When Done) ──

  const replayQuestionPrompt = useCallback(() => {
    const currentPrompt = questions[currentQ]?.prompt;
    if (!currentPrompt) return;
    stopListening();
    setAiSpeaking(true);
    speak(currentPrompt, () => {
      setAiSpeaking(false);
      setPhase("answering");
      startListening();
    });
  }, [questions, currentQ, stopListening, startListening]);

  // ── Submit Spoken Answer ──────────────────────────────────────────────────

  const submitAnswer = useCallback(async () => {
    const q = questions[currentQ];
    if (!q || answer.trim().split(/\s+/).filter(Boolean).length < 2) return;
    stopListening();
    setPhase("evaluating");
    setEvaluating(true);

    let evaluation: Evaluation = {
      overall: 74,
      dimensions: { relevance: 76, structure: 72, evidence: 70, communication: 78, technical_depth: 72 },
      strengths: ["Clear spoken articulation", "Directly addressed the technical prompt via voice"],
      improvements: ["Provide more quantitative metrics and architectural edge cases"],
    };

    try {
      const res = await fetch("/api/backend/interviews/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q.prompt, answer, role: activeTopic, use_llm: true }),
      });
      if (res.ok) evaluation = (await res.json()) as Evaluation;
    } catch {
      // fallback rubric
    }

    const currentScore = antiCheatData?.integrity_score ?? 100;
    const record: AnswerRecord = {
      question: q,
      answer,
      evaluation,
      cheatingFlags: antiCheatData?.violations ?? [],
      integrityScoreAtTime: currentScore,
    };

    const nextAnswers = [...answers, record];
    setAnswers(nextAnswers);
    setEvaluating(false);

    const nextQ = currentQ + 1;
    if (nextQ >= questions.length) {
      setPhase("complete");
      stopCamera();
      stopListening();
      const avg = Math.round(nextAnswers.reduce((s, r) => s + r.evaluation.overall, 0) / nextAnswers.length);
      onComplete?.(nextAnswers, avg);
    } else {
      setCurrentQ(nextQ);
      setAnswer("");
      finalTranscriptRef.current = "";
      setInterimText("");
      setPhase("question");
      const nextQuestion = questions[nextQ];
      if (nextQuestion) {
        setAiSpeaking(true);
        // AI reads the next question aloud; mic opens automatically right after
        speak(nextQuestion.prompt, () => {
          setAiSpeaking(false);
          setPhase("answering");
          startListening();
        });
      }
    }
  }, [questions, currentQ, answer, activeTopic, antiCheatData, answers, stopCamera, onComplete, stopListening, startListening]);

  // ── Toggle camera ─────────────────────────────────────────────────────────

  const toggleCamera = useCallback(() => {
    if (!streamRef.current) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setCameraOn(track.enabled);
  }, []);

  // ── Render: Setup Screen ──────────────────────────────────────────────────

  if (phase === "setup") {
    return (
      <div className="mx-auto max-w-3xl">
        {onBack && (
          <button onClick={onBack} className="mb-4 inline-flex items-center gap-1 text-xs font-semibold text-[#7158d5]">
            <ChevronLeft size={15} /> Back to interviews
          </button>
        )}
        <div className="rounded-3xl border border-[#eeeaf4] bg-white p-6 shadow-sm sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f1edf8] pb-5">
            <div className="flex items-center gap-3">
              <span className="grid size-12 place-items-center rounded-2xl bg-[#f0edff] text-[#7258dc] shadow-sm">
                <Video size={24} />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold text-[#2d2640]">AI Video Interview & Proctoring</h1>
                  <span className="rounded-full bg-[#f2efff] px-2.5 py-0.5 text-[10px] font-semibold text-[#6e54d5]">
                    Voice Answering · AI Audio TTS
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[#8f88a0]">Topic: {activeTopic} · {questionCount} Random Practice Questions</p>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-xl bg-[#faf9fd] px-3 py-1.5 text-[11px] font-medium text-[#645c75]">
              <ShieldCheck size={14} className="text-[#38a169]" /> AI Integrity Engine Active
            </div>
          </div>

          {/* 1. Choose Interview Topic */}
          <div className="mt-6">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-[#9b94a0]">
                1. Select Interview Topic / Role
              </p>
              <span className="text-[10px] text-[#7258dc] font-semibold">Active: {activeTopic}</span>
            </div>
            <div className="mt-2.5 grid gap-2 sm:grid-cols-3">
              {TOPIC_OPTIONS.map((t) => {
                const isSelected = activeTopic === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTopic(t.id)}
                    className={`flex items-start gap-2.5 rounded-2xl border p-3 text-left transition ${
                      isSelected
                        ? "border-[#7257df] bg-[#f7f5ff] ring-2 ring-[#7257df]/30"
                        : "border-[#f0edf7] bg-[#fbfaff] hover:border-[#ded6f8]"
                    }`}
                  >
                    <span className="text-xl">{t.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-semibold ${isSelected ? "text-[#583fce]" : "text-[#2d2640]"}`}>
                        {t.label}
                      </p>
                      <p className="mt-0.5 text-[10px] leading-3 text-[#8a829a] line-clamp-1">{t.tag}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Choose Question Count (10-15 Questions) */}
          <div className="mt-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#9b94a0]">
              2. Number of Practice Questions (10–15 Questions)
            </p>
            <div className="mt-2.5 flex flex-wrap gap-2.5">
              {[10, 12, 15].map((cnt) => (
                <button
                  key={cnt}
                  type="button"
                  onClick={() => setQuestionCount(cnt)}
                  className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
                    questionCount === cnt
                      ? "bg-[#7257df] text-white shadow-sm ring-2 ring-[#7257df]/30"
                      : "border border-[#e6e1f0] bg-white text-[#5d5671] hover:bg-[#f8f7fd]"
                  }`}
                >
                  {cnt} Questions {cnt === 12 ? "(Standard)" : cnt === 15 ? "(Comprehensive)" : "(Quick)"}
                </button>
              ))}
            </div>
          </div>

          {/* Voice-First Protocol Notice */}
          <div className="mt-5 rounded-2xl border border-purple-200 bg-gradient-to-r from-purple-50 via-[#faf9fe] to-purple-50 p-3.5">
            <div className="flex items-start gap-2.5">
              <Mic size={18} className="mt-0.5 shrink-0 text-[#7257df] animate-pulse" />
              <div className="text-xs leading-relaxed text-[#3b334d]">
                <p className="font-semibold text-[#2d2640]">Voice-Only Answering Protocol</p>
                <p className="mt-0.5 text-[11px] text-[#6d647e]">
                  1. The AI Interviewer reads each question aloud using Text-to-Speech.<br />
                  2. <strong>Your microphone activates automatically</strong> as soon as the question reading finishes.<br />
                  3. Answer solely in voice (text chat typing is disabled). Words are transcribed in real time.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-[#9b94a0]">
              5 Core Anti-Cheat Proctoring Rules (Active in Background)
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {[
                {
                  id: "1",
                  title: "1. Face Detection",
                  desc: "Verifies candidate face is continuously visible in camera frame.",
                  icon: Users,
                  engine: "MediaPipe Face",
                },
                {
                  id: "2",
                  title: "2. Multiple-Face Detection",
                  desc: "Flags if second person or unauthorized companion enters camera view (3 strikes = disqualify).",
                  icon: ShieldAlert,
                  engine: "YOLO + MediaPipe",
                },
                {
                  id: "3",
                  title: "3. Head-Pose Estimation",
                  desc: "Estimates 3D yaw/pitch/roll to detect persistent turning away from screen.",
                  icon: Sparkles,
                  engine: "3D SolvePnP",
                },
                {
                  id: "4",
                  title: "4. Eye-Gaze Estimation",
                  desc: "Tracks iris & gaze angles to detect reading off-screen notes or prompts.",
                  icon: Eye,
                  engine: "Iris Landmark Mesh",
                },
                {
                  id: "5",
                  title: "5. Object Detection",
                  desc: "Detects unauthorized mobile phones, laptops, and reference books.",
                  icon: Smartphone,
                  engine: "YOLOv8 Pretrained",
                },
                {
                  id: "6",
                  title: "Temporal Event Analysis",
                  desc: "Smooths frames over time to avoid single-frame false alarms with alert logging.",
                  icon: Clock3,
                  engine: "Event Engine",
                },
              ].map((item) => (
                <div key={item.id} className="flex items-start gap-3 rounded-2xl border border-[#f0edf7] bg-[#fbfaff] p-3.5">
                  <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-white text-[#7258dc] shadow-sm">
                    <item.icon size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-[#2d2640]">{item.title}</p>
                      <span className="text-[9px] font-medium text-[#9a91ab]">{item.engine}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-4 text-[#7b748d]">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {cameraError && (
            <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-[#f3d9d5] bg-[#fff7f5] p-3.5 text-xs text-[#a35248]">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <span>{cameraError}</span>
            </div>
          )}

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              onClick={() => void beginInterview()}
              disabled={loadingQuestions}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#7257df] py-3 text-sm font-semibold text-white shadow-md hover:bg-[#6349ce] disabled:opacity-60"
            >
              {loadingQuestions ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Generating {questionCount} Practice Questions…
                </>
              ) : (
                <>
                  <Video size={16} /> Start Interview ({questionCount} Questions · {activeTopic})
                </>
              )}
            </button>
            <button
              onClick={() => void startCamera()}
              className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-[#eeeaf4] px-4 py-3 text-xs font-semibold text-[#746d85] hover:bg-[#faf9fc]"
            >
              <Camera size={14} /> Test Webcam
            </button>
          </div>
          <p className="mt-3 text-center text-[10px] text-[#9b94a8]">
            Proctoring events generate alerts for review. 3 strikes on multiple faces will terminate with -25% marking.
          </p>
        </div>
      </div>
    );
  }

  // ── Render: Countdown ─────────────────────────────────────────────────────

  if (phase === "countdown") {
    return (
      <div className="flex flex-col items-center justify-center gap-6 py-24">
        <div className="grid size-24 place-items-center rounded-3xl bg-gradient-to-tr from-[#7257df] to-[#9d8bf0] text-5xl font-bold text-white shadow-lg animate-pulse">
          {countdown > 0 ? countdown : "GO"}
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-[#2d2640]">Connecting with AI Interviewer…</p>
          <p className="mt-1 text-xs text-[#8f88a0]">Initializing MediaPipe face mesh and YOLO detection</p>
        </div>
      </div>
    );
  }

  // ── Render: Terminated / Disqualified Screen (Negative Marking) ───────────

  if (phase === "terminated") {
    const penalty = antiCheatData?.negative_marking?.penalty_score ?? -25;
    const strikeRecords = antiCheatData?.negative_marking?.strike_records?.length
      ? antiCheatData.negative_marking.strike_records
      : [
          { strike: 1, timestamp: "Recorded", persons_count: 2, detail: "Secondary person observed in webcam" },
          { strike: 2, timestamp: "Recorded", persons_count: 2, detail: "Secondary person observed in webcam" },
          { strike: 3, timestamp: "Recorded", persons_count: 2, detail: "3rd strike violation: Multiple candidate malpractice" },
        ];

    return (
      <div className="mx-auto max-w-3xl space-y-5">
        <div className="rounded-3xl border-2 border-red-500/80 bg-gradient-to-b from-[#2a0c0c] to-[#140606] p-8 text-center text-white shadow-2xl">
          <span className="mx-auto grid size-20 place-items-center rounded-3xl bg-red-600/90 text-white shadow-xl ring-8 ring-red-500/20 animate-pulse">
            <Ban size={42} />
          </span>

          <div className="mt-4">
            <span className="inline-block rounded-full border border-red-400/40 bg-red-500/20 px-4 py-1 font-mono text-[10px] font-black uppercase tracking-widest text-red-300">
              Integrity Violation · Disqualified
            </span>
          </div>

          <h1 className="mt-3 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Interview Terminated Immediately
          </h1>
          <p className="mx-auto mt-2 max-w-lg text-xs leading-5 text-red-200">
            This interview session has been automatically terminated because more than one candidate / unauthorized persons appeared in the webcam on 3 separate occasions.
          </p>

          {/* Negative Marking Penalty Box */}
          <div className="mt-6 mx-auto max-w-md rounded-2xl border border-red-500/40 bg-black/50 p-5 backdrop-blur-md">
            <div className="flex items-center justify-between border-b border-red-900/60 pb-3">
              <span className="text-xs font-semibold text-red-300">Official Exam Verdict</span>
              <span className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-white">
                DISQUALIFIED (FAIL)
              </span>
            </div>
            <div className="mt-4 flex items-center justify-around">
              <div>
                <p className="text-[10px] font-mono uppercase text-red-400">Score Awarded</p>
                <p className="text-4xl font-extrabold text-red-400">{penalty}%</p>
                <p className="text-[10px] text-red-300">Negative marking penalty</p>
              </div>
              <div className="h-12 w-px bg-red-900/70" />
              <div>
                <p className="text-[10px] font-mono uppercase text-red-400">Total Strikes</p>
                <p className="text-4xl font-extrabold text-white">3 / 3</p>
                <p className="text-[10px] text-red-300">Multi-person threshold</p>
              </div>
            </div>
          </div>

          {/* Itemized 3-Strike Incident Records */}
          <div className="mt-6 text-left">
            <p className="text-xs font-mono font-bold uppercase tracking-wider text-red-300 mb-2.5">
              Recorded Malpractice Strike History
            </p>
            <div className="space-y-2">
              {strikeRecords.map((rec, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-xl border border-red-900/60 bg-red-950/50 p-3 text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="grid size-6 place-items-center rounded-lg bg-red-600 font-bold text-white text-[10px]">
                      {rec.strike}
                    </span>
                    <div>
                      <p className="font-semibold text-white">Strike {rec.strike}: Multiple Persons ({rec.persons_count})</p>
                      <p className="text-[10px] text-red-200">{rec.detail}</p>
                    </div>
                  </div>
                  <span className="font-mono text-[10px] text-red-400">{rec.timestamp}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-xs font-bold text-slate-900 shadow hover:bg-slate-100"
              >
                Return to Interview Center
              </button>
            )}
            <button
              onClick={() => window.open(`/interviews/proctor?session=${sessionId}`, "_blank")}
              className="inline-flex items-center gap-2 rounded-xl border border-red-400/50 bg-red-900/40 px-5 py-2.5 text-xs font-bold text-white hover:bg-red-900/60"
            >
              Open Proctor Incident Audit ↗
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Render: Complete Report ───────────────────────────────────────────────

  if (phase === "complete") {
    const avgScore = answers.length
      ? Math.round(answers.reduce((s, r) => s + r.evaluation.overall, 0) / answers.length)
      : 78;
    const finalIntegrity = antiCheatData?.integrity_score ?? 100;
    const isClean = allSessionEvents.length === 0;

    return (
      <div className="mx-auto max-w-4xl space-y-5">
        <div className="rounded-3xl border border-[#eeeaf4] bg-white p-7 text-center shadow-sm">
          <div className="flex flex-wrap items-center justify-center gap-6">
            <div>
              <span className="mx-auto grid size-12 place-items-center rounded-2xl bg-[#f0edff] text-[#7258dc]">
                <Award size={24} />
              </span>
              <p className="mt-2 text-xs font-medium text-[#8f88a0]">Interview Score</p>
              <p className="text-4xl font-bold text-[#2d2640]">{avgScore}%</p>
            </div>
            <div className="h-16 w-px bg-[#eeeaf4]" />
            <div>
              <span className={`mx-auto grid size-12 place-items-center rounded-2xl ${finalIntegrity >= 85 ? "bg-[#eaf7ef] text-[#3f8b60]" : "bg-[#fff4f0] text-[#c05a40]"}`}>
                <Shield size={24} />
              </span>
              <p className="mt-2 text-xs font-medium text-[#8f88a0]">Proctoring Integrity</p>
              <p className={`text-4xl font-bold ${finalIntegrity >= 85 ? "text-[#3f8b60]" : "text-[#c05a40]"}`}>
                {finalIntegrity}%
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            {finalIntegrity >= 85 ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d1f0de] bg-[#f1fbf5] px-3 py-1 text-xs font-semibold text-[#3f8b60]">
                <ShieldCheck size={14} /> Verified High Integrity Session
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[#f8d7c8] bg-[#fff4f0] px-3 py-1 text-xs font-semibold text-[#c05a40]">
                <ShieldAlert size={14} /> Requires Proctor Review ({allSessionEvents.length} events flagged)
              </span>
            )}
          </div>
        </div>

        {/* Proctoring Rules Audit Log */}
        <div className="rounded-3xl border border-[#eeeaf4] bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-[#f0edf7] pb-4">
            <div>
              <h2 className="text-sm font-semibold text-[#2d2640]">Proctoring Audit Summary</h2>
              <p className="text-[11px] text-[#8f88a0]">Results across 5 AI anti-cheat rules during this video session</p>
            </div>
            <span className="text-xs font-semibold text-[#7158d5]">{allSessionEvents.length} events logged</span>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-5">
            {[
              {
                name: "Face Detection",
                pass: !allSessionEvents.some((e) => e.event_type.includes("NO_FACE")),
                icon: Users,
              },
              {
                name: "Multiple Faces",
                pass: !allSessionEvents.some((e) => e.event_type.includes("MULTIPLE_FACES")),
                icon: ShieldAlert,
              },
              {
                name: "Head Pose",
                pass: !allSessionEvents.some((e) => e.event_type.includes("HEAD_TURNED")),
                icon: Sparkles,
              },
              {
                name: "Eye Gaze",
                pass: !allSessionEvents.some((e) => e.event_type.includes("EYE_GAZE")),
                icon: Eye,
              },
              {
                name: "Objects (YOLO)",
                pass: !allSessionEvents.some((e) => e.event_type.includes("PHONE") || e.event_type.includes("BOOK")),
                icon: Smartphone,
              },
            ].map((rule) => (
              <div key={rule.name} className="rounded-2xl border border-[#f0edf7] bg-[#faf9fd] p-3 text-center">
                <span className={`mx-auto grid size-7 place-items-center rounded-lg ${rule.pass ? "bg-[#eaf7ef] text-[#3f8b60]" : "bg-[#fff4f0] text-[#c05a40]"}`}>
                  <rule.icon size={13} />
                </span>
                <p className="mt-2 text-[11px] font-semibold text-[#2d2640]">{rule.name}</p>
                <span className={`mt-1 inline-block text-[10px] font-bold ${rule.pass ? "text-[#3f8b60]" : "text-[#c05a40]"}`}>
                  {rule.pass ? "CLEAN" : "FLAGGED"}
                </span>
              </div>
            ))}
          </div>

          {/* Detailed timeline if any */}
          {allSessionEvents.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold text-[#2d2640]">Flagged Events Timeline</p>
              <div className="mt-2 space-y-2">
                {allSessionEvents.map((ev, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border border-[#f0edf7] bg-[#fbfaff] p-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                        ev.severity === "HIGH" ? "bg-red-100 text-red-700" : ev.severity === "MEDIUM" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                      }`}>
                        {ev.severity}
                      </span>
                      <span className="font-medium text-[#2d2640]">{ev.description}</span>
                    </div>
                    <span className="text-[11px] text-[#8f88a0]">
                      {ev.started_at ? `${ev.started_at} · ` : ""}
                      {ev.duration_seconds ? `${ev.duration_seconds}s duration` : "recorded"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Answers scored */}
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#9b94a0]">Interview Answers & Evaluations</p>
          {answers.map((record, i) => (
            <div key={i} className="rounded-2xl border border-[#eeeaf4] bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="text-xs font-semibold text-[#2d2640]">
                  Q{i + 1}: {record.question.prompt}
                </p>
                <span className="shrink-0 rounded-lg bg-[#f0edff] px-2.5 py-1 text-xs font-bold text-[#7258dc]">
                  {record.evaluation.overall}%
                </span>
              </div>
              <p className="mt-2.5 text-xs leading-5 text-[#6f687e]">{record.answer}</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {record.evaluation.strengths.slice(0, 1).map((s, si) => (
                  <div key={si} className="rounded-xl border border-[#e7f2ea] bg-[#fbfefc] p-2.5 text-[11px] text-[#3f8b60]">
                    <CheckCircle2 size={13} className="mb-1 inline-block mr-1 text-[#47976a]" />
                    {s}
                  </div>
                ))}
                {record.evaluation.improvements.slice(0, 1).map((imp, ii) => (
                  <div key={ii} className="rounded-xl border border-[#f6ead8] bg-[#fffdf9] p-2.5 text-[11px] text-[#b27b39]">
                    <AlertCircle size={13} className="mb-1 inline-block mr-1 text-[#b27b39]" />
                    {imp}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {onBack && (
          <button
            onClick={onBack}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#eeeaf4] py-3 text-sm font-semibold text-[#7158d5] hover:bg-[#faf9fc]"
          >
            <ChevronLeft size={16} /> Return to Interviews
          </button>
        )}
      </div>
    );
  }

  // ── Render: Active Video Call Session ─────────────────────────────────────

  const q = questions[currentQ];
  const progressPct = questions.length ? Math.round(((currentQ + 1) / questions.length) * 100) : 0;
  const telemetry = antiCheatData?.telemetry;
  const boxes = antiCheatData?.bounding_boxes;
  const frameW = boxes?.frame_w || 640;
  const frameH = boxes?.frame_h || 480;

  return (
    <div className="mx-auto max-w-6xl">
      {/* Top Header Bar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {onBack && (
            <button
              onClick={onBack}
              className="grid size-8 place-items-center rounded-xl border border-[#eeeaf4] bg-white text-[#746d85] hover:bg-[#faf9fc]"
              title="Leave Call"
            >
              <ChevronLeft size={15} />
            </button>
          )}
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-[#2d2640]">AI Video Interview · {activeTopic}</h2>
              <span className="size-2 rounded-full bg-red-500 animate-ping" />
            </div>
            <p className="text-[10px] text-[#8f88a0]">
              Question {currentQ + 1} of {questions.length} · Voice Answering Active
            </p>
          </div>
        </div>

        {/* Real-time Status Badges & Proctor Remote Screen */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Launcher for Interviewer Live Monitor */}
          <button
            onClick={() => window.open(`/interviews/proctor?session=${sessionId}`, "_blank", "width=1320,height=880")}
            className="inline-flex items-center gap-1.5 rounded-full border border-[#8066e9]/40 bg-[#f7f5ff] px-3.5 py-1 text-[11px] font-semibold text-[#6d53d3] shadow-sm hover:bg-[#eeeaff]"
            title="Open Remote Interviewer Live Monitoring View"
          >
            <Radio size={13} className="text-[#8066e9] animate-pulse" />
            Interviewer Live View ↗
          </button>

          {/* Strikes Counter */}
          <div className={`flex items-center gap-1.5 rounded-full border px-3 py-1 shadow-sm ${
            strikes >= 3
              ? "border-red-400 bg-red-50 text-red-700"
              : strikes === 2
              ? "border-amber-400 bg-amber-50 text-amber-700 animate-pulse"
              : strikes === 1
              ? "border-yellow-400 bg-yellow-50 text-yellow-700"
              : "border-[#eeeaf4] bg-white text-[#2d2640]"
          }`}>
            <ShieldAlert size={12} />
            <span className="text-[11px] font-semibold">
              Strikes: {strikes}/3
            </span>
          </div>

          {/* Integrity Score */}
          <div className="flex items-center gap-1.5 rounded-full border border-[#eeeaf4] bg-white px-3 py-1 shadow-sm">
            <Shield size={12} className={antiCheatData?.integrity_score && antiCheatData.integrity_score < 80 ? "text-[#c05a40]" : "text-[#3f8b60]"} />
            <span className="text-[11px] font-semibold text-[#2d2640]">
              Integrity {antiCheatData?.integrity_score ?? 100}%
            </span>
          </div>

          {/* Active Alert Badge */}
          {antiCheatData?.alert ? (
            <span className="inline-flex animate-pulse items-center gap-1.5 rounded-full border border-[#f8d7c8] bg-[#fff4f0] px-3 py-1 text-[11px] font-semibold text-[#c05a40]">
              <ShieldAlert size={12} /> {antiCheatData.message || "Proctoring Alert"}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d1f0de] bg-[#f1fbf5] px-3 py-1 text-[11px] font-semibold text-[#3f8b60]">
              <ShieldCheck size={12} /> Single Face Verified
            </span>
          )}
        </div>
      </div>

      {/* Progress Line */}
      <div className="mb-4 h-1.5 w-full overflow-hidden rounded-full bg-[#f0edf5]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#7257df] to-[#9d8bf0] transition-all duration-500"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Main Video Call Split Grid */}
      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        {/* Left Column: Video Feeds & Live Proctoring HUD */}
        <div className="space-y-3">
          {/* Candidate Webcam Feed with Modernized Futuristic Cyber HUD */}
          <div className="relative overflow-hidden rounded-3xl border border-[#2e2a42] bg-[#0c0a14] shadow-2xl" style={{ aspectRatio: "4/3" }}>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`h-full w-full object-cover transition-opacity duration-300 ${!cameraOn ? "opacity-0" : ""}`}
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Cyberpunk Holographic Reticles & Corner HUD Brackets */}
            <div className="pointer-events-none absolute inset-0 z-10">
              {/* Subtle top/bottom gradient overlay for HUD legibility */}
              <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/60" />

              {/* Glowing Corner Brackets */}
              <div className="absolute top-3.5 left-3.5 h-6 w-6 border-l-2 border-t-2 border-[#8066e9]/90 shadow-[0_0_8px_#8066e9]" />
              <div className="absolute top-3.5 right-3.5 h-6 w-6 border-r-2 border-t-2 border-[#8066e9]/90 shadow-[0_0_8px_#8066e9]" />
              <div className="absolute bottom-3.5 left-3.5 h-6 w-6 border-l-2 border-b-2 border-[#8066e9]/90 shadow-[0_0_8px_#8066e9]" />
              <div className="absolute bottom-3.5 right-3.5 h-6 w-6 border-r-2 border-b-2 border-[#8066e9]/90 shadow-[0_0_8px_#8066e9]" />

              {/* Cyber HUD Model Badges Top Left */}
              <div className="absolute top-4 left-5 flex flex-wrap items-center gap-1.5">
                <span className="flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 font-mono text-[9px] font-semibold text-emerald-400 backdrop-blur-md">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  CLAHE ILLUMINATION
                </span>
                <span className="rounded-md bg-black/60 px-2 py-0.5 font-mono text-[9px] font-semibold text-sky-400 backdrop-blur-md">
                  MediaPipe 3D Mesh
                </span>
                <span className="rounded-md bg-black/60 px-2 py-0.5 font-mono text-[9px] font-semibold text-purple-300 backdrop-blur-md">
                  YOLOv8 CPU
                </span>
              </div>

              {/* Real-time Strikes Counter Top Right */}
              <div className="absolute top-4 right-5">
                <span className={`inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wider backdrop-blur-md shadow-lg ${
                  strikes >= 3 ? "bg-red-600/95 text-white" : strikes > 0 ? "bg-amber-600/95 text-white animate-pulse" : "bg-emerald-600/80 text-white"
                }`}>
                  <ShieldAlert size={12} />
                  STRIKES: {strikes}/3
                </span>
              </div>
            </div>

            {/* Live SVG Bounding Box Layer & 3D Wireframe (Rules 1, 2, 5) */}
            {cameraOn && showBoundingBoxes && boxes && (
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full z-10"
                viewBox={`0 0 ${frameW} ${frameH}`}
                preserveAspectRatio="none"
              >
                {/* 3D Facial Mesh Wireframe Points */}
                {showMesh && boxes.mesh_points && boxes.mesh_points.length > 0 && (
                  <g opacity={0.65}>
                    {boxes.mesh_points.map(([mx, my], mIdx) => (
                      <circle
                        key={`mesh-pt-${mIdx}`}
                        cx={mx}
                        cy={my}
                        r={1.8}
                        fill="#38bdf8"
                      />
                    ))}
                  </g>
                )}

                {/* Faces Bounding Boxes with Sci-Fi Glowing Reticles */}
                {boxes.faces.map((f, idx) => {
                  const isBad = f.status === "flagged" || !f.is_primary;
                  const color = isBad ? "#ef4444" : "#10b981";
                  const glow = isBad ? "drop-shadow(0 0 6px rgba(239,68,68,0.75))" : "drop-shadow(0 0 6px rgba(16,185,129,0.75))";
                  return (
                    <g key={`face-${idx}`} style={{ filter: glow }}>
                      {/* Box border */}
                      <rect
                        x={f.x}
                        y={f.y}
                        width={f.w}
                        height={f.h}
                        fill="none"
                        stroke={color}
                        strokeWidth={2}
                        strokeDasharray={isBad ? "5 3" : "none"}
                        rx={8}
                      />
                      {/* High-tech Corner reticle brackets */}
                      <path
                        d={`M ${f.x} ${f.y + 14} L ${f.x} ${f.y} L ${f.x + 14} ${f.y}`}
                        fill="none"
                        stroke={color}
                        strokeWidth={3}
                      />
                      <path
                        d={`M ${f.x + f.w - 14} ${f.y} L ${f.x + f.w} ${f.y} L ${f.x + f.w} ${f.y + 14}`}
                        fill="none"
                        stroke={color}
                        strokeWidth={3}
                      />
                      <path
                        d={`M ${f.x} ${f.y + f.h - 14} L ${f.x} ${f.y + f.h} L ${f.x + 14} ${f.y + f.h}`}
                        fill="none"
                        stroke={color}
                        strokeWidth={3}
                      />
                      <path
                        d={`M ${f.x + f.w - 14} ${f.y + f.h} L ${f.x + f.w} ${f.y + f.h} L ${f.x + f.w} ${f.y + f.h - 14}`}
                        fill="none"
                        stroke={color}
                        strokeWidth={3}
                      />
                      {/* Header Badge */}
                      <rect
                        x={f.x}
                        y={Math.max(0, f.y - 22)}
                        width={Math.max(140, f.w * 0.75)}
                        height={20}
                        fill={color}
                        opacity={0.92}
                        rx={4}
                      />
                      <text
                        x={f.x + 6}
                        y={Math.max(14, f.y - 8)}
                        fill="#ffffff"
                        fontSize={11}
                        fontWeight="bold"
                        fontFamily="monospace"
                      >
                        {f.label} {isBad ? "⚠️ UNCONFIRMED" : "✓ CANDIDATE"}
                      </text>
                    </g>
                  );
                })}

                {/* Objects Bounding Boxes (YOLO: cell phone, book, laptop) */}
                {boxes.objects.map((obj, idx) => {
                  if (!obj.flagged) return null;
                  const [x1, y1, x2, y2] = obj.bbox;
                  const w = x2 - x1;
                  const h = y2 - y1;
                  return (
                    <g key={`obj-${idx}`} style={{ filter: "drop-shadow(0 0 6px rgba(249,115,22,0.8))" }}>
                      <rect
                        x={x1}
                        y={y1}
                        width={w}
                        height={h}
                        fill="none"
                        stroke="#f97316"
                        strokeWidth={2.5}
                        rx={6}
                      />
                      <rect
                        x={x1}
                        y={Math.max(0, y1 - 22)}
                        width={Math.max(140, w)}
                        height={20}
                        fill="#f97316"
                        opacity={0.94}
                        rx={4}
                      />
                      <text
                        x={x1 + 6}
                        y={Math.max(14, y1 - 8)}
                        fill="#ffffff"
                        fontSize={11}
                        fontWeight="bold"
                        fontFamily="monospace"
                      >
                        {obj.class.toUpperCase()} ({Math.round(obj.confidence * 100)}%) ⚠️
                      </text>
                    </g>
                  );
                })}
              </svg>
            )}

            {/* Camera Off Overlay */}
            {!cameraOn && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-white z-20">
                <CameraOff size={32} className="text-[#8f88a0]" />
                <p className="text-xs text-[#8f88a0]">Webcam feed disabled</p>
              </div>
            )}

            {/* Strike 1 & 2 Warning Banner Overlay */}
            {strikes > 0 && strikes < 3 && (
              <div className="absolute top-12 left-4 right-4 rounded-2xl bg-amber-600/95 px-4 py-2.5 text-white shadow-2xl backdrop-blur-md animate-pulse z-20 border border-amber-400/40">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <ShieldAlert size={18} className="shrink-0 text-white" />
                    <div>
                      <p className="text-xs font-bold tracking-wide">
                        MALPRACTICE WARNING: STRIKE {strikes} OF 3
                      </p>
                      <p className="text-[10px] text-amber-100">
                        Multiple persons detected in camera frame. 3 strikes will immediately terminate the interview with negative marking (-25%).
                      </p>
                    </div>
                  </div>
                  <span className="rounded-md bg-black/40 px-2 py-1 font-mono text-[10px] font-bold">
                    {3 - strikes} STRIKE REMAINING
                  </span>
                </div>
              </div>
            )}

            {/* Cell Phone Warning Banner Overlay */}
            {antiCheatData?.violations.includes("cell_phone_detected") && (
              <div className="absolute top-28 left-4 right-4 rounded-2xl bg-amber-600/90 px-4 py-2.5 text-white shadow-xl backdrop-blur-sm animate-pulse z-20">
                <div className="flex items-center gap-2">
                  <Smartphone size={18} className="shrink-0" />
                  <div>
                    <p className="text-xs font-bold">UNAUTHORIZED DEVICE DETECTED (MOBILE PHONE)</p>
                    <p className="text-[10px] opacity-90">Please place all phones and external devices away.</p>
                  </div>
                </div>
              </div>
            )}

            {/* Proctor Message Toast Overlay */}
            {proctorToast && (
              <div className="absolute bottom-16 left-4 right-4 rounded-2xl bg-purple-950/95 border border-purple-500/60 p-3 text-white shadow-2xl backdrop-blur-md z-30 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Volume2 size={16} className="text-purple-300 shrink-0" />
                  <div>
                    <p className="text-[10px] font-mono text-purple-300 uppercase font-bold">Message from Interviewer</p>
                    <p className="text-xs font-semibold">{proctorToast}</p>
                  </div>
                </div>
                <button onClick={() => setProctorToast(null)} className="text-purple-300 hover:text-white">
                  <X size={15} />
                </button>
              </div>
            )}

            {/* Bottom Controls Bar */}
            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-2xl bg-black/70 px-3 py-1.5 backdrop-blur-md z-20 border border-white/10">
              <button
                onClick={toggleCamera}
                className={`grid size-9 place-items-center rounded-xl transition ${
                  cameraOn ? "text-white hover:bg-white/20" : "bg-red-500 text-white"
                }`}
                title={cameraOn ? "Turn camera off" : "Turn camera on"}
              >
                {cameraOn ? <Camera size={16} /> : <CameraOff size={16} />}
              </button>
              <button
                onClick={() => setMicOn((m) => !m)}
                className={`grid size-9 place-items-center rounded-xl transition ${
                  micOn ? "text-white hover:bg-white/20" : "bg-red-500 text-white"
                }`}
                title={micOn ? "Mute microphone" : "Unmute microphone"}
              >
                {micOn ? <Mic size={16} /> : <MicOff size={16} />}
              </button>
              <button
                onClick={() => setShowBoundingBoxes((b) => !b)}
                className={`grid size-9 place-items-center rounded-xl transition ${
                  showBoundingBoxes ? "text-[#a38fff] hover:bg-white/20" : "text-white/60 hover:bg-white/20"
                }`}
                title={showBoundingBoxes ? "Hide bounding boxes" : "Show bounding boxes"}
              >
                <Layers size={16} />
              </button>
              <button
                onClick={() => setShowMesh((m) => !m)}
                className={`grid size-9 place-items-center rounded-xl transition ${
                  showMesh ? "text-[#38bdf8] hover:bg-white/20" : "text-white/60 hover:bg-white/20"
                }`}
                title={showMesh ? "Hide 3D Face Wireframe" : "Show 3D Face Wireframe"}
              >
                <Sparkles size={16} />
              </button>
              <button
                onClick={() => {
                  setPhase("complete");
                  stopCamera();
                }}
                className="grid size-9 place-items-center rounded-xl bg-red-500/80 text-white hover:bg-red-600 transition"
                title="End interview session"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Live Telemetry HUD Bar (Rules 1-5 Real-time metrics) */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {/* Rule 1 & 2: Faces */}
            <div className="rounded-2xl border border-[#eeeaf4] bg-white p-3 shadow-sm">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9b94a0]">Face Detection</span>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs font-bold text-[#2d2640]">
                  {antiCheatData ? `${antiCheatData.face_count} Person` : "1 Person"}
                </span>
                <span
                  className={`size-2 rounded-full ${
                    antiCheatData?.face_count === 1 ? "bg-green-500" : "bg-red-500 animate-pulse"
                  }`}
                />
              </div>
            </div>

            {/* Rule 3: Head Pose */}
            <div className="rounded-2xl border border-[#eeeaf4] bg-white p-3 shadow-sm">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9b94a0]">Head Pose</span>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs font-bold text-[#2d2640]">
                  {telemetry?.head_pose?.direction || "CENTER"} (Yaw {telemetry?.head_pose?.yaw ?? 0}°)
                </span>
                <span
                  className={`size-2 rounded-full ${
                    telemetry?.head_pose?.direction === "CENTER" ? "bg-green-500" : "bg-amber-500"
                  }`}
                />
              </div>
            </div>

            {/* Rule 4: Eye Gaze */}
            <div className="rounded-2xl border border-[#eeeaf4] bg-white p-3 shadow-sm">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9b94a0]">Eye Gaze</span>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs font-bold text-[#2d2640]">
                  {telemetry?.eye_gaze?.direction || "CENTER"}
                </span>
                <span
                  className={`size-2 rounded-full ${
                    telemetry?.eye_gaze?.direction === "CENTER" ? "bg-green-500" : "bg-amber-500"
                  }`}
                />
              </div>
            </div>

            {/* Rule 5: YOLO Objects */}
            <div className="rounded-2xl border border-[#eeeaf4] bg-white p-3 shadow-sm">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[#9b94a0]">YOLO Object Scan</span>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs font-bold text-[#2d2640]">
                  {boxes?.objects?.some((o) => o.flagged) ? "Item Detected ⚠️" : "Clean"}
                </span>
                <span
                  className={`size-2 rounded-full ${
                    boxes?.objects?.some((o) => o.flagged) ? "bg-red-500 animate-ping" : "bg-green-500"
                  }`}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: AI Interviewer & Answer Panel OR Proctor Dashboard */}
        <div className="flex flex-col gap-3">
          {/* Tab Selector */}
          <div className="flex rounded-2xl border border-[#eeeaf4] bg-white p-1">
            <button
              onClick={() => setActiveTab("interview")}
              className={`flex-1 rounded-xl py-2 text-xs font-semibold transition ${
                activeTab === "interview" ? "bg-[#7257df] text-white shadow-sm" : "text-[#7b748d] hover:text-[#2d2640]"
              }`}
            >
              Interview & Answer
            </button>
            <button
              onClick={() => setActiveTab("proctor")}
              className={`flex-1 rounded-xl py-2 text-xs font-semibold transition ${
                activeTab === "proctor" ? "bg-[#7257df] text-white shadow-sm" : "text-[#7b748d] hover:text-[#2d2640]"
              }`}
            >
              Proctor Dashboard ({allSessionEvents.length})
            </button>
          </div>

          {activeTab === "interview" ? (
            <>
              {/* AI Interviewer Tile */}
              <div className="rounded-3xl border border-[#eeeaf4] bg-white p-5 shadow-sm">
                <AIAvatar speaking={aiSpeaking} role={activeTopic} />
                {q && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#7257df]">
                        Question {currentQ + 1} of {questions.length} · {q.topic}
                      </span>
                      {aiSpeaking && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2.5 py-0.5 text-[10px] font-bold text-purple-700 animate-pulse">
                          <Volume2 size={12} /> AI Asking Question…
                        </span>
                      )}
                    </div>
                    <h3 className="mt-2 text-base font-semibold leading-relaxed text-[#2d2640]">{q.prompt}</h3>
                    {q.why && <p className="mt-2 text-[11px] leading-4 text-[#8f88a0]">{q.why}</p>}
                  </div>
                )}
                <div className="mt-3.5 flex items-center justify-between border-t border-[#f1edf8] pt-3 text-[11px] text-[#8f88a0]">
                  <button
                    onClick={() => replayQuestionPrompt()}
                    disabled={aiSpeaking}
                    className="inline-flex items-center gap-1.5 font-semibold text-[#7257df] hover:underline disabled:opacity-50"
                  >
                    <Volume2 size={13} /> Replay Audio Prompt
                  </button>
                  <span className="rounded-md bg-[#f6f4fa] px-2 py-0.5 text-[10px] font-medium text-[#7a748c]">
                    Voice-Only Mode Active
                  </span>
                </div>
              </div>

              {/* Candidate Voice Answer Station */}
              {(phase === "answering" || phase === "question") && (
                <div className="rounded-3xl border border-[#eeeaf4] bg-white p-5 shadow-sm">
                  {/* Status Header */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[#2d2640]">Your Spoken Response</span>
                      {listening ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-500/30 animate-pulse">
                          <span className="size-2 rounded-full bg-emerald-500 animate-ping" />
                          MIC LIVE · SPEAK NOW
                        </span>
                      ) : aiSpeaking ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2.5 py-0.5 text-[10px] font-semibold text-purple-700 ring-1 ring-purple-400/40">
                          <Volume2 size={11} className="animate-bounce" /> Listening for AI to finish…
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-semibold text-slate-600">
                          Mic Paused
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Language / Accent Selector */}
                      <select
                        value={speechLang}
                        onChange={(e) => {
                          const newLang = e.target.value;
                          setSpeechLang(newLang);
                          if (listening) {
                            stopListening();
                            setTimeout(() => startListening(), 100);
                          }
                        }}
                        className="rounded-lg border border-[#e6e2ee] bg-[#faf9fe] px-2 py-1 text-[10px] font-semibold text-[#675f78] focus:border-[#7257df] focus:outline-none"
                        title="Speech Recognition Dialect / Accent"
                      >
                        <option value="en-US">English (US)</option>
                        <option value="en-IN">English (India)</option>
                        <option value="en-GB">English (UK)</option>
                      </select>

                      <span className="text-[10px] font-medium text-[#8f88a0]">
                        {answer.trim().split(/\s+/).filter(Boolean).length} words
                      </span>
                    </div>
                  </div>

                  {/* AI Speaking Banner */}
                  {aiSpeaking && (
                    <div className="mt-3 flex items-center gap-2.5 rounded-2xl border border-purple-200 bg-purple-50/80 p-3 text-xs text-purple-900">
                      <Volume2 size={16} className="shrink-0 text-[#7257df] animate-pulse" />
                      <span>
                        The AI Interviewer is reading Question {currentQ + 1} of {questions.length} aloud.{" "}
                        <strong>Your microphone will activate automatically</strong> the moment reading completes.
                      </span>
                    </div>
                  )}

                  {/* Speech Error Banner if any */}
                  {speechError && (
                    <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                      <div className="flex items-center gap-2">
                        <AlertTriangle size={15} className="shrink-0 text-amber-600" />
                        <span>{speechError}</span>
                      </div>
                      <button
                        onClick={() => startListening()}
                        className="shrink-0 rounded-lg bg-amber-200 px-2.5 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-300"
                      >
                        Restart Mic
                      </button>
                    </div>
                  )}

                  {/* Live Volume & Audio Activity Bar (Proves mic is hearing sound) */}
                  {listening && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-emerald-50/90 border border-emerald-200 px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="size-2 rounded-full bg-emerald-500 animate-ping" />
                        <span className="text-[11px] font-bold text-emerald-800">Mic Input Signal:</span>
                        <div className="h-2 w-20 overflow-hidden rounded-full bg-emerald-200">
                          <div
                            className="h-full bg-emerald-600 transition-all duration-75"
                            style={{ width: `${Math.max(8, micVolume)}%` }}
                          />
                        </div>
                        <span className="font-mono text-[10px] font-bold text-emerald-700">
                          {micVolume > 0 ? `${micVolume}%` : "Active"}
                        </span>
                      </div>

                      {interimText && (
                        <span className="text-[11px] font-medium text-emerald-800 italic truncate max-w-[240px]">
                          Hearing: "{interimText}"
                        </span>
                      )}
                    </div>
                  )}

                  {/* Real-time Live Transcription & Editable Response Area */}
                  <div className="mt-3">
                    <textarea
                      value={answer}
                      onChange={(e) => {
                        setAnswer(e.target.value);
                        finalTranscriptRef.current = e.target.value;
                      }}
                      rows={5}
                      placeholder={
                        listening
                          ? "🎙️ Speak aloud into your microphone... Your words will transcribe here in real time (you can also edit or type directly)."
                          : "Microphone is waiting for AI to finish reading, or click 'Resume Mic' below to speak your response."
                      }
                      className="w-full resize-none rounded-2xl border border-[#e8e4f0] bg-[#faf9fe] p-3.5 text-xs leading-6 text-[#231b34] placeholder:text-[#a59eb2] focus:border-[#7257df] focus:bg-white focus:outline-none"
                    />
                    <div className="mt-1.5 flex items-center justify-between text-[10px] text-[#9b94a8]">
                      <span className="flex items-center gap-1">
                        {listening ? (
                          <span className="text-emerald-700 font-medium">● Live voice transcription stream active</span>
                        ) : (
                          <span>Microphone idle</span>
                        )}
                      </span>
                      <span>You can speak aloud or edit/correct words anytime</span>
                    </div>
                  </div>

                  {/* Control Buttons */}
                  <div className="mt-3.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          if (listening) stopListening();
                          else startListening();
                        }}
                        className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                          listening
                            ? "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
                            : "border-[#eeeaf4] text-[#746d85] hover:bg-[#faf9fc]"
                        }`}
                      >
                        {listening ? (
                          <>
                            <Square size={13} /> Pause Mic
                          </>
                        ) : (
                          <>
                            <Mic size={13} /> Resume Mic
                          </>
                        )}
                      </button>

                      {answer.trim() && (
                        <button
                          onClick={() => {
                            setAnswer("");
                            finalTranscriptRef.current = "";
                            setInterimText("");
                          }}
                          className="inline-flex items-center gap-1 rounded-xl border border-[#eeeaf4] px-2.5 py-2 text-xs text-[#8f88a0] hover:text-[#5d5671]"
                          title="Clear transcribed text and re-speak"
                        >
                          Clear Text
                        </button>
                      )}
                    </div>

                    <button
                      onClick={() => void submitAnswer()}
                      disabled={answer.trim().split(/\s+/).filter(Boolean).length < 2 || evaluating}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#7257df] px-4 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-[#6349ce] disabled:opacity-40"
                    >
                      {evaluating ? (
                        <>
                          <Loader2 size={14} className="animate-spin" /> Evaluating Answer…
                        </>
                      ) : (
                        <>
                          <span>Submit Answer & Next Question</span>
                          <ChevronRight size={14} />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {phase === "evaluating" && (
                <div className="flex flex-col items-center justify-center rounded-3xl border border-[#eeeaf4] bg-white p-8 text-center shadow-sm">
                  <Loader2 size={26} className="animate-spin text-[#7257df]" />
                  <p className="mt-3 text-xs font-semibold text-[#2d2640]">Scoring response with AI rubric…</p>
                  <p className="text-[10px] text-[#8f88a0]">Relevance + Communication + Technical Depth</p>
                </div>
              )}
            </>
          ) : (
            /* Proctor Dashboard Side Panel */
            <div className="rounded-3xl border border-[#eeeaf4] bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between border-b border-[#f1edf8] pb-3">
                <p className="text-xs font-semibold text-[#2d2640]">Live Suspicious Events Feed</p>
                <span className="text-[10px] font-bold text-[#7257df]">Real-Time Audit</span>
              </div>

              <div className="mt-3 space-y-2 max-h-[360px] overflow-y-auto">
                {allSessionEvents.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#8f88a0]">
                    <ShieldCheck size={28} className="mx-auto mb-2 text-[#3f8b60]" />
                    No suspicious events detected yet.
                    <p className="mt-1 text-[10px]">Candidate is verified and compliant.</p>
                  </div>
                ) : (
                  allSessionEvents.map((ev, i) => (
                    <div key={i} className="rounded-xl border border-[#f0edf7] bg-[#fbfaff] p-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                            ev.severity === "HIGH"
                              ? "bg-red-100 text-red-700"
                              : ev.severity === "MEDIUM"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {ev.severity}
                        </span>
                        <span className="text-[10px] text-[#8f88a0]">{ev.duration_seconds ? `${ev.duration_seconds}s` : "alert"}</span>
                      </div>
                      <p className="mt-1 text-[11px] font-medium text-[#2d2640]">{ev.description}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
