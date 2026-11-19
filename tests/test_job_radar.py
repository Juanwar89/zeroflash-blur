"""Unit tests for Job & Bounty Radar (offline mocked APIs + scoring/report)."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "job_radar"))

import radar


class _MockResponse:
    def __init__(self, json_data=None, text_data: str = "") -> None:
        self._json = json_data
        self.text = text_data

    def raise_for_status(self) -> None:
        return None

    def json(self):
        return self._json


class JobRadarTestCase(unittest.TestCase):
    def test_scoring_prefers_junior_elixir_python_over_senior(self) -> None:
        jr_elixir = radar.Opportunity(
            id="1",
            kind="job",
            source="Test",
            title="Junior Elixir & Phoenix Developer",
            company="Acme",
            location="Remote",
            url="https://example.com/1",
            published_at="2026-11-14",
            tags=["elixir", "python"],
        )
        sr_java = radar.Opportunity(
            id="2",
            kind="job",
            source="Test",
            title="Senior Staff Java Architect",
            company="BigCorp",
            location="Remote",
            url="https://example.com/2",
            published_at="2026-11-14",
            tags=["java"],
        )
        radar.score_opportunity(jr_elixir)
        radar.score_opportunity(sr_java)

        self.assertGreater(jr_elixir.score, 25)
        self.assertLess(sr_java.score, 0)

    def test_run_radar_mocked_sources_and_seen_state(self) -> None:
        def fake_get(url, **kwargs):
            if "remoteok.com" in url:
                return _MockResponse(
                    json_data=[
                        {"legal": "notice"},
                        {
                            "id": "rk1",
                            "position": "Junior Python Automation Engineer",
                            "company": "BotFlow",
                            "location": "Remote",
                            "url": "https://remoteok.com/rk1",
                            "date": "2026-11-14",
                            "tags": ["python", "automation"],
                        },
                    ]
                )
            if "remotive.com" in url:
                return _MockResponse(
                    json_data={
                        "jobs": [
                            {
                                "id": 10,
                                "title": "Senior Principal Platform Lead",
                                "company_name": "Mega",
                                "url": "https://remotive.com/10",
                                "tags": ["python"],
                            }
                        ]
                    }
                )
            if "arbeitnow.com" in url:
                return _MockResponse(json_data={"data": []})
            if "weworkremotely.com" in url:
                rss = """<rss><channel><item>
                  <title>ElixirCo: Entry Elixir Backend Developer</title>
                  <link>https://wwr.com/elixir1</link>
                  <pubDate>Sat, 14 Nov 2026</pubDate>
                  <category>Back-End Programming</category>
                </item></channel></rss>"""
                return _MockResponse(text_data=rss)
            if "api.github.com" in url:
                return _MockResponse(
                    json_data={
                        "items": [
                            {
                                "id": 500,
                                "title": "[BOUNTY $150] Python CSV cleaner",
                                "html_url": "https://github.com/org/repo/issues/1",
                                "repository_url": "https://api.github.com/repos/org/repo",
                                "updated_at": "2026-11-14T10:00:00Z",
                                "labels": [{"name": "bounty"}],
                            }
                        ]
                    }
                )
            raise AssertionError(f"Unexpected URL: {url}")

        with tempfile.TemporaryDirectory() as tmp:
            state_path = Path(tmp) / "seen.json"
            report_path = Path(tmp) / "report.html"

            with patch("radar.requests.get", side_effect=fake_get):
                first_run = radar.run_radar(
                    min_score=6,
                    state_file=state_path,
                    report_file=report_path,
                    save_state=True,
                )
                self.assertEqual(len(first_run), 3)
                self.assertTrue(all(o.is_new for o in first_run))
                self.assertTrue(report_path.is_file())
                html_text = report_path.read_text(encoding="utf-8")
                self.assertIn("Entry Elixir Backend Developer", html_text)
                self.assertIn("[BOUNTY $150]", html_text)

                second_run = radar.run_radar(
                    min_score=6,
                    state_file=state_path,
                    report_file=report_path,
                    save_state=True,
                )
                self.assertEqual(len(second_run), 3)
                self.assertTrue(all(not o.is_new for o in second_run))


if __name__ == "__main__":
    unittest.main()
