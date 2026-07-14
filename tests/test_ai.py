import unittest
from unittest.mock import patch

from backend.ai.config import load_ai_config
from backend.ai.providers import LocalAIProvider, MockAIProvider


class AIConfigTests(unittest.TestCase):
    def test_invalid_profile_falls_back_to_balanced(self):
        with patch.dict("os.environ", {"OLLAMA_CHAT_PROFILE": "invalid"}, clear=False):
            config = load_ai_config()
        self.assertEqual(config.default_profile, "balanced")
        self.assertEqual(config.model_for("fast"), "qwen3:4b-instruct")

    def test_mock_provider_is_predictable_and_offline(self):
        provider = MockAIProvider()
        self.assertTrue(provider.health_check()["available"])
        self.assertEqual(provider.create_embeddings(["uno", "cuatro"], "mock"), [[3.0, 0.0, 1.0], [6.0, 0.0, 1.0]])
        self.assertTrue(provider.generate_structured("", "mock", {})["human_review_required"])

    def test_local_provider_lists_models_without_downloading(self):
        provider = LocalAIProvider(load_ai_config())
        with patch.object(provider, "_request", return_value={"models": [{"name": "qwen3:8b"}, {"name": "qwen3:4b"}]}):
            self.assertEqual(provider.list_available_models(), ["qwen3:4b", "qwen3:8b"])


if __name__ == "__main__":
    unittest.main()
