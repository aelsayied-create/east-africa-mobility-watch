import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from fetch_real_data import hazard_of, window_months  # noqa: E402
from build_data import assign_adm1, label  # noqa: E402


def test_window_is_last_12_complete_months():
    w = window_months(date(2026, 10, 26))
    assert len(w) == 12 and w[0] == (2025, 10) and w[-1] == (2026, 9)


def test_window_crosses_year_boundary():
    assert window_months(date(2026, 1, 5))[-1] == (2025, 12)


def test_hazard_mapping():
    assert hazard_of({"displacement_type": "Conflict", "type": "NIAC"}) == "Conflict"
    assert hazard_of({"displacement_type": "Disaster", "type": "Flood"}) == "Flood"
    assert hazard_of({"displacement_type": "Disaster", "type": "Storm"}) == "Other disasters"
    assert hazard_of({"displacement_type": "Other", "type": None}) is None


def test_label():
    assert label("2025-10") == "Oct 2025"


def test_assign_adm1_inside_nearest_and_missing():
    sq = lambda x0, y0: {"type": "Polygon", "coordinates": [[[x0, y0], [x0 + 1, y0], [x0 + 1, y0 + 1], [x0, y0 + 1], [x0, y0]]]}  # noqa: E731
    adm1 = [{"properties": {"id": "A", "iso3": "KEN"}, "geometry": sq(0, 0)},
            {"properties": {"id": "B", "iso3": "UGA"}, "geometry": sq(1, 0)}]
    ev = [{"iso3": "KEN", "lat": 0.5, "lon": 0.5},      # inside A
          {"iso3": "KEN", "lat": 0.5, "lon": -0.2},     # just outside A -> nearest
          {"iso3": "KEN", "lat": 0.5, "lon": 1.3},      # inside B but wrong country -> nearest A
          {"iso3": "KEN", "lat": None, "lon": None}]    # no coordinates
    stats = assign_adm1(ev, adm1)
    assert [e["adm1"] for e in ev] == ["A", "A", "A", None]
    assert stats == {"inside": 1, "nearest": 2, "unassigned": 1}
