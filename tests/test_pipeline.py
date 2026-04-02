from __future__ import annotations

import unittest

from research_idea_explorer.engine import build_query_seed, run_idea_pipeline
from research_idea_explorer.providers import search_local_library
from research_idea_explorer.retrieval import build_literature_index
from research_idea_explorer.sample_data import sample_papers, sample_seed


class PipelineTests(unittest.TestCase):
    def test_sample_pipeline_matches_js_baseline_frontier_shape(self) -> None:
        index = build_literature_index(sample_papers)
        pipeline = run_idea_pipeline(sample_seed, index, query="urban heat adaptation", rounds=2, frontier_limit=6)
        self.assertEqual(pipeline["effectiveRounds"], 2)
        self.assertEqual(len(pipeline["frontier"]), 6)
        self.assertEqual(pipeline["literatureMap"]["queryCount"], 6)
        self.assertEqual(
            pipeline["frontier"][0]["title"],
            "Estimating urban heat adaptation across older adults and working-age residents",
        )
        self.assertEqual(pipeline["frontier"][0]["scores"]["nearestPaperId"], "paper-3")

    def test_query_seed_pipeline_runs_from_live_like_seed(self) -> None:
        index = build_literature_index(sample_papers)
        literature_result = {"providers": ["local"], "papers": sample_papers}
        seed = build_query_seed("urban heat planning", literature_result)
        pipeline = run_idea_pipeline(seed, index, query="urban heat planning", rounds=1, frontier_limit=4)
        self.assertEqual(pipeline["effectiveRounds"], 1)
        self.assertEqual(len(pipeline["frontier"]), 4)

