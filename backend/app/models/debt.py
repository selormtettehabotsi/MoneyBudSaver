import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, Date, Numeric, Text, ForeignKey
from sqlalchemy.orm import relationship
from app.db.session import Base


class Debt(Base):
    __tablename__ = "debts"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(150), nullable=False)
    total_principal = Column(Numeric(14, 2), nullable=False)
    remaining_balance = Column(Numeric(14, 2), nullable=False)
    interest_rate = Column(Numeric(6, 3), default=0.000, nullable=False)  # annual % (e.g. 15.5)
    minimum_payment = Column(Numeric(14, 2), nullable=False)
    due_day_of_month = Column(Integer, default=1, nullable=False)
    start_date = Column(Date, nullable=False)
    estimated_payoff_date = Column(Date, nullable=True)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # Relationships
    user = relationship("User", back_populates="debts")
