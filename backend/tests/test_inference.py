"""Tests for the numpy helpers - no server, no model needed."""
import numpy as np
import pytest

from app.inference import (InputError, clean_series, describe_region, find_regions, resample, softmax,
                           time_label, window_starts, z_normalise)


def test_describe_region_percent_only_for_positive_signals():
    # visits / kW: never below 0 -> a percent is fine
    visits = np.full(100, 10.0)
    visits[40:50] = 5.0
    d = describe_region(visits, 40, 49)
    assert d["level_change_pct"] is not None and d["level_change_pct"] < -40
    # a centred signal (like ECG): the average is ~0, a percent would explode -> only the std shift
    centred = np.sin(np.linspace(0, 6 * np.pi, 120))
    centred[60:70] -= 3
    d = describe_region(centred, 60, 69)
    assert d["level_change_pct"] is None
    assert d["level_change_sd"] < -1


def test_window_starts():
    assert window_starts(1008, 1008) == [0]
    assert window_starts(3024, 1008) == [0, 1008, 2016]          # fits exactly
    assert window_starts(2500, 1008) == [0, 1008, 1492]          # last one ends at the end


def test_clean_series_rejects_bad_input():
    with pytest.raises(InputError):
        clean_series([1.0] * 5)                       # too short
    with pytest.raises(InputError):
        clean_series([1.0] * 40 + [float("nan")])     # nan


def test_resample_keeps_ends_and_length():
    x = np.arange(10, dtype=float)
    y = resample(x, 19)
    assert len(y) == 19
    assert y[0] == 0 and y[-1] == 9
    assert np.allclose(resample(x, 10), x)            # same length -> unchanged


def test_z_normalise_matches_training():
    x = np.array([1.0, 2.0, 3.0, 4.0])
    z = z_normalise(x)
    assert abs(z.mean()) < 1e-12
    assert abs(z.std(ddof=1) - 1) < 1e-12             # sample std like torch.std
    assert np.all(z_normalise(np.ones(5)) == 0)       # flat line does not divide by zero


def test_softmax_sums_to_one():
    p = softmax(np.array([1000.0, 1001.0, 999.0]))    # big numbers must not overflow
    assert abs(p.sum() - 1) < 1e-12 and p.argmax() == 1


def test_time_label():
    assert time_label(0, 10) == "Day 1, 00:00"
    assert time_label(150, 10) == "Day 2, 01:00"      # 1500 min = 1 day + 60 min
    assert time_label(5, None) is None


def test_find_regions_finds_the_bump():
    score = np.zeros(1000)
    score[400:450] = 1.0                              # one clear block of evidence
    score[800] = 0.2
    regions = find_regions(score, top_frac=0.05)
    assert regions[0]["start"] == 400 and regions[0]["end"] == 449
    assert regions[0]["share"] > 0.9


def test_find_regions_no_positive_evidence():
    assert find_regions(-np.ones(100)) == []
