"""
Backend App Email Service facade.
Re-exports canonical email service implementation from app.services.email_service.
"""
from .services.email_service import (
    send_email,
    send_task_assigned_email,
    send_vote_required_email,
    send_vote_closed_email,
    send_stay_booked_email,
    send_password_reset_email,
    notify_coordinator_new_issue,
    notify_all_members_project_vote,
    render_email_layout,
    check_firewall,
    RESEND_API_KEY,
    EMAIL_TEST_MODE,
    EMAIL_TEST_REDIRECT_TO,
    ALLOWED_RECIPIENTS,
    ALLOWED_TEST_RECIPIENTS,
    DEFAULT_MEMBER_EMAILS,
    DEFAULT_FROM_EMAIL,
)

__all__ = [
    "send_email",
    "send_task_assigned_email",
    "send_vote_required_email",
    "send_vote_closed_email",
    "send_stay_booked_email",
    "send_password_reset_email",
    "notify_coordinator_new_issue",
    "notify_all_members_project_vote",
    "render_email_layout",
    "check_firewall",
    "RESEND_API_KEY",
    "EMAIL_TEST_MODE",
    "EMAIL_TEST_REDIRECT_TO",
    "ALLOWED_RECIPIENTS",
    "ALLOWED_TEST_RECIPIENTS",
    "DEFAULT_MEMBER_EMAILS",
    "DEFAULT_FROM_EMAIL",
]
