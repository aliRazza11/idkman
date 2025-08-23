import numpy as np
import logging


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class BetaScheduler:
    def __init__(self, steps: int, schedule: str):
        """
        Initializes the BetaScheduler object.

        Args:
            steps (int): Number of diffusion steps (maximum=1000).
            schedule (str): Beta schedule type ('linear' or 'cosine').

        Raises:
            ValueError: If image decoding fails or beta_schedule is invalid.
        """
        if steps > 1000:
            raise ValueError("Maximum allowed steps are 1000")
        self.steps = steps
        self.schedule = schedule
        
    def _compute_beta(self, steps: int, schedule: str = "linear", max:int = 0.02, min:int=0.001) -> np.ndarray:
        """
        Computes betas for the given number of steps and schedule.

        Args:
            steps (int): Number of steps.
            schedule (str): Beta schedule type ('linear' or 'cosine').

        Returns:
            np.ndarray: beta value over the given number of steps

        Raises:
            ValueError: If unsupported schedule is provided,
            or if number of steps is greater than 1000.
        """
        if schedule == "linear":
            beta = np.linspace(min, max, 1000)[:steps]
        elif schedule == "cosine":
            t = np.linspace(min, np.pi / 2, 1000)[:steps]
            beta = np.sin(t) ** 2 * max
        else:
            logger.error(f"Unsupported beta schedule: {schedule}")
            raise ValueError("Unsupported beta schedule. Use 'linear' or 'cosine'.")
        
        return beta
    
    def _compute_alphas_bar(self, steps: int, schedule: str = "linear") -> float:
        """
        Computes cumulative product of alphas (alphas_bar) for the given schedule.

        Args:
            steps (int): Number of steps.
            schedule (str): Beta schedule type ('linear' or 'cosine').

        Returns:
            Tuple[np.ndarray, float]: Values of alpha_bar and the product of alphas over the steps

        Raises:
            ValueError: If an unsupported schedule is provided.
        """
        beta = self._compute_beta(steps, schedule)
        alphas = 1 - beta
        alphas_bar = np.cumprod(alphas)
        logger.debug(f"Computed alphas_bar: {alphas_bar[-1]:.4f}")
        return alphas_bar, alphas_bar[-1]
    
    def get_beta(self):
        return self._compute_beta(self.steps, self.schedule)
    
    def get_alpha_bar(self):
        return self._compute_alphas_bar(self.steps, self.schedule)[1]