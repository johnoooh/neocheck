"""Tests for the feedback writer (HF Dataset upload)."""

from unittest.mock import MagicMock, patch

from utils.feedback import FeedbackEntry, submit_feedback


def make_entry():
    return FeedbackEntry(
        rating="up",
        comment="great",
        email=None,
        model="local:Qwen/Qwen3-14B",
        mutation="BRAF V600E",
        hla=["HLA-A*02:01"],
        last_user_msg="explain this",
        last_assistant_msg="here you go",
    )


@patch("utils.feedback.HfApi")
def test_submit_feedback_uploads_jsonl(mock_api_cls):
    api = MagicMock()
    mock_api_cls.return_value = api

    submit_feedback(
        make_entry(),
        repo_id="someuser/feedback",
        token="hf_test",
    )

    assert api.upload_file.called
    kwargs = api.upload_file.call_args.kwargs
    assert kwargs["repo_id"] == "someuser/feedback"
    assert kwargs["repo_type"] == "dataset"
    assert kwargs["path_in_repo"].endswith(".jsonl")
    body = kwargs["path_or_fileobj"]
    if hasattr(body, "read"):
        body = body.read()
    body = body.decode() if isinstance(body, bytes) else body
    assert '"rating": "up"' in body
    assert '"mutation": "BRAF V600E"' in body


@patch("utils.feedback.HfApi")
def test_submit_feedback_truncates_long_text(mock_api_cls):
    api = MagicMock()
    mock_api_cls.return_value = api
    entry = make_entry()
    entry.last_user_msg = "x" * 5000

    submit_feedback(entry, repo_id="u/r", token="t")

    body = api.upload_file.call_args.kwargs["path_or_fileobj"]
    if hasattr(body, "read"):
        body = body.read()
    body = body.decode() if isinstance(body, bytes) else body
    # Truncated to 1000 chars
    assert "x" * 1001 not in body
