import logging

logger = logging.getLogger(__name__)

class ProviderHealth:
    def __init__(self):
        self.state = "Healthy"  # Healthy, Degraded, Offline, Recovering
        self.error_count = 0
        self.success_count = 0

    def record_failure(self):
        self.error_count += 1
        self.success_count = 0
        
        if self.state == "Healthy" and self.error_count >= 2:
            self.state = "Degraded"
            logger.warning(f"Provider health state changed to Degraded (errors: {self.error_count})")
        elif self.state in ["Degraded", "Recovering"] and self.error_count >= 5:
            self.state = "Offline"
            logger.error(f"Provider health state changed to Offline (errors: {self.error_count})")
            
    def record_success(self):
        self.success_count += 1
        
        if self.state == "Offline" and self.success_count >= 1:
            self.state = "Recovering"
            self.error_count = 0
            logger.info("Provider health state changed to Recovering (1 success after offline)")
        elif self.state in ["Degraded", "Recovering"] and self.success_count >= 5:
            self.state = "Healthy"
            self.error_count = 0
            logger.info(f"Provider health state changed to Healthy (successes: {self.success_count})")

# Global instances for tracking
openai_health = ProviderHealth()
gemini_health = ProviderHealth()
huggingface_health = ProviderHealth()
