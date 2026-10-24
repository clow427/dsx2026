"""Shared pytest configuration.

Hypothesis profiles for the property-based tests (`tests/**/test_*_properties.py`):

- `dev` (default): 100 examples per property.
- `hook`: 20 examples, used by the Kiro save hook so feedback stays fast.
- `ci`: 1,000 examples, for a deeper run before merging.

Select one with `HYPOTHESIS_PROFILE=ci .venv/bin/python -m pytest`.
"""

import os

from hypothesis import HealthCheck, settings

settings.register_profile("dev", max_examples=100, deadline=None)
settings.register_profile("hook", max_examples=20, deadline=None)
settings.register_profile(
    "ci", max_examples=1000, deadline=None, suppress_health_check=[HealthCheck.too_slow]
)
settings.load_profile(os.environ.get("HYPOTHESIS_PROFILE", "dev"))
