"""Bounded request contracts for Career Quest."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class StrictRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")


class CreateRunRequest(StrictRequest):
    career_key: str = Field(min_length=1, max_length=64)
    difficulty: Literal["beginner", "intermediate", "advanced"]


class InteractionRequest(StrictRequest):
    action: Literal["decision", "reflection", "manager_message"]
    choices: list[str] = Field(default_factory=list, max_length=6)
    text: str | None = Field(default=None, max_length=1000)


class AttemptRequest(StrictRequest):
    language: Literal["python"] = "python"
    source_code: str = Field(min_length=1, max_length=20000)
    idempotency_key: str = Field(min_length=8, max_length=128, pattern=r"^[A-Za-z0-9_.:-]+$")


class EmptyRequest(StrictRequest):
    """An explicit empty object prevents clients from smuggling scores or IDs."""
