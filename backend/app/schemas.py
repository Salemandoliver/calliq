"""Pydantic response/request schemas."""
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---- auth ----
class LoginRequest(BaseModel):
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    user: "UserOut"


# ---- users / teams ----
class UserOut(ORM):
    id: int
    name: str
    email: str
    role: str
    job_title: str
    team_id: int | None
    avatar_color: str
    active: bool


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    role: str = "recorder"
    job_title: str = "Sales Rep"
    team_id: int | None = None


class UserUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    job_title: str | None = None
    team_id: int | None = None
    active: bool | None = None
    password: str | None = None


class TeamOut(ORM):
    id: int
    name: str
    owner_id: int | None


class TeamCreate(BaseModel):
    name: str
    owner_id: int | None = None


# ---- calls ----
class TurnOut(ORM):
    id: int
    speaker: str
    speaker_name: str
    start_sec: float
    end_sec: float
    text: str


class AnalysisOut(ORM):
    summary_intro: str
    summary_points: list
    action_items: list
    key_points: list
    themes: list
    talk_ratio: float
    longest_monologue_sec: float
    longest_customer_story_sec: float
    talking_speed_wpm: float
    patience_sec: float
    question_rate: float
    sentiment: str


class ScoreOut(ORM):
    id: int
    playbook_id: int
    overall: float
    criteria: list
    coaching: str


class CallTopicOut(BaseModel):
    topic_id: int
    name: str
    color: str
    mentions: int
    first_mention_sec: float


class CallListItem(BaseModel):
    id: int
    host: UserOut | None
    direction: str
    activity_type: str
    from_number: str
    to_number: str
    customer_name: str
    started_at: datetime
    duration_sec: int
    status: str
    plays: int
    likes: int
    shares: int
    comments: int
    overall_score: float | None
    topics: list[CallTopicOut] = []


class CallDetail(CallListItem):
    audio_url: str | None
    error: str | None
    turns: list[TurnOut] = []
    analysis: AnalysisOut | None = None
    scores: list[ScoreOut] = []


class CallPage(BaseModel):
    items: list[CallListItem]
    total: int
    page: int
    page_size: int


class CommentCreate(BaseModel):
    body: str
    at_sec: float | None = None


class CommentOut(ORM):
    id: int
    user: UserOut
    at_sec: float | None
    body: str
    created_at: datetime


# ---- admin entities ----
class TopicIn(BaseModel):
    name: str
    keywords: list[str] = []
    color: str = "#ef4444"
    active: bool = True


class TopicOut(ORM):
    id: int
    name: str
    keywords: list
    color: str
    active: bool


class PlaybookIn(BaseModel):
    name: str
    description: str = ""
    activity_types: list[str] = []
    criteria: list[dict] = []
    active: bool = True


class PlaybookOut(ORM):
    id: int
    name: str
    description: str
    activity_types: list
    criteria: list
    active: bool


class VocabularyIn(BaseModel):
    term: str


class SavedSearchIn(BaseModel):
    name: str
    params: dict


class SavedSearchOut(ORM):
    id: int
    name: str
    params: dict


class ReportOut(ORM):
    id: int
    name: str
    report_type: str
    frequency: str
    period_start: datetime
    period_end: datetime
    team_names: list
    content_md: str
    created_at: datetime


TokenResponse.model_rebuild()
