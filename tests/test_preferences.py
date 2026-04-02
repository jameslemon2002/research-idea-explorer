from __future__ import annotations

import unittest

from research_idea_explorer.preferences import extract_preferences_from_notes


class PreferenceTests(unittest.TestCase):
    def test_extract_preferences_from_mixed_language_note(self) -> None:
        profile = extract_preferences_from_notes(
            ["不要 survey，更偏 causal identification，要 policy relevance"]
        )
        self.assertEqual(profile["preferredClaims"], ["identify"])
        self.assertEqual(profile["avoidEvidenceKinds"], ["survey"])
        self.assertEqual(profile["stakes"], ["policy relevance"])
        self.assertEqual(profile["avoidClaims"], [])
