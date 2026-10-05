import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, DateTime, Date, JSON, ForeignKey
from sqlalchemy.orm import relationship
from app.db.session import Base


class SuggestionLog(Base):
    __tablename__ = "suggestion_logs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    week_start_date = Column(Date, nullable=False)
    findings = Column(JSON, default=dict, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    user = relationship("User", back_populates="suggestion_logs")
