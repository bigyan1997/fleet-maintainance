"""One line in the activity log per change — who added, changed or deleted
what. Called from the API views (not model signals) because only the view
knows who is logged in."""

from .models import ActivityLog


def _who(user):
    if user is None or not user.is_authenticated:
        return None, ""
    return user, user.get_full_name() or user.get_username()


def log(user, action, kind, summary, vehicle=None, who_label=None):
    who, label = _who(user)
    ActivityLog.objects.create(
        who=who,
        who_label=who_label or label,
        action=action,
        kind=kind,
        summary=summary[:300],
        vehicle=vehicle,
    )


def status_word(status):
    from .services import STATUS_WORDS

    return STATUS_WORDS.get(status, status)


def service_kind(record):
    from .services import WASH_SERVICE_TYPE

    return "Wash" if record.service_type == WASH_SERVICE_TYPE else "Service"


def describe_service(record):
    if service_kind(record) == "Wash":
        return f"{record.vehicle} washed {record.date:%d-%m-%Y}"
    cost = f" · ${record.cost}" if record.cost else ""
    by = f" · by {record.mechanic}" if record.mechanic_id else ""
    return f"{record.service_type} for {record.vehicle} · {record.date:%d-%m-%Y} · {status_word(record.status)}{by}{cost}"


def describe_fuel(record):
    what = f"{record.litres} L" if record.is_fuel else (record.product or "charge")
    return f"{what} for {record.vehicle} · {record.date:%d-%m-%Y} · ${record.cost}"


def describe_incident(record):
    return f"{record.incident_type} ({record.severity}) for {record.vehicle} · {record.date:%d-%m-%Y} · {record.status}"
