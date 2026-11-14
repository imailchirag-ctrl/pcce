from pydantic import BaseModel


class ValidationIssue(BaseModel):
    field: str
    issue: str


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: list[ValidationIssue] | None = None


class ErrorResponse(BaseModel):
    error: ErrorDetail
