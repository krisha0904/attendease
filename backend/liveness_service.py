import importlib
import os
from collections.abc import Callable

import cv2


class LivenessUnavailable(RuntimeError):
    pass


def _provider() -> Callable:
    provider_path = os.getenv("LIVENESS_PROVIDER", "").strip()
    if ":" not in provider_path:
        if not provider_path:
            try:
                return importlib.import_module("passive_liveness").verify
            except (ImportError, AttributeError) as exc:
                raise LivenessUnavailable("The bundled local liveness provider could not be loaded.") from exc
        raise LivenessUnavailable("A validated in-process liveness provider is not configured.")
    module_name, function_name = provider_path.rsplit(":", 1)
    if not module_name or not function_name:
        raise LivenessUnavailable("LIVENESS_PROVIDER must use module:function format.")
    try:
        module = importlib.import_module(module_name)
        provider = getattr(module, function_name)
    except (ImportError, AttributeError) as exc:
        raise LivenessUnavailable("The configured liveness provider could not be loaded.") from exc
    if not callable(provider):
        raise LivenessUnavailable("The configured liveness provider is not callable.")
    return provider


def verify_sequence(instruction: str, frames: list[str]) -> tuple[bool, float | None]:
    if not 4 <= len(frames) <= 12:
        return False, None
    try:
        result = _provider()(instruction=instruction, frames=frames)
    except LivenessUnavailable:
        raise
    except (cv2.error, ValueError, RuntimeError) as exc:
        raise LivenessUnavailable("The configured liveness provider failed during verification.") from exc
    if not isinstance(result, dict):
        raise LivenessUnavailable("The liveness provider returned an invalid response.")
    live = result.get("live") is True
    score = result.get("score")
    if score is not None:
        try:
            score = float(score)
        except (TypeError, ValueError) as exc:
            raise LivenessUnavailable("The liveness provider returned an invalid score.") from exc
        if not 0 <= score <= 1:
            raise LivenessUnavailable("The liveness provider returned an invalid score.")
    return live, score
