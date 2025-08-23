import base64
import logging
from io import BytesIO
import matplotlib.pyplot as plt
import numpy as np
from PIL import Image

# Setup basic logging (You can configure this differently in your main app)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class Diffusion:
    """
    A class to perform forward diffusion on base64-encoded images using a noise schedule.

    Attributes:
        steps (int): Number of diffusion steps.
        beta_schedule (str): Type of beta schedule to use. Can be 'linear' or 'cosine'.
    """

    def __init__(self, encoded_img: str, steps: int, beta_schedule: str = "linear"):
        """
        Initializes the Diffusion object.

        Args:
            encoded_img (str): Base64-encoded image string.
            steps (int): Number of diffusion steps (maximum=1000).
            beta_schedule (str): Beta schedule type ('linear' or 'cosine').

        Raises:
            ValueError: If image decoding fails or beta_schedule is invalid.
        """
        self.steps = steps
        self.beta_schedule = beta_schedule

        self.img = self._decode_image(encoded_img)
        self.img_shape = self.img.shape
        self.normalized_img = self.img / 255.0
        self.alphas_bar = self._compute_alphas_bar(steps, beta_schedule)
        self.beta = self._compute_beta(steps, beta_schedule)

        logger.info(f"Initialized Diffusion with shape {self.img_shape}, "
                    f"{steps} steps, beta schedule '{beta_schedule}'")

    def _decode_image(self, encoded_img: str) -> np.ndarray:
        """
        Decodes a base64 image string into a NumPy RGB array.

        Args:
            encoded_img (str): Base64-encoded image.

        Returns:
            np.ndarray: Decoded image as an array.

        Raises:
            ValueError: If decoding or image opening fails.
        """
        try:
            decoded = base64.b64decode(encoded_img)
            image = Image.open(BytesIO(decoded)).convert("RGB")
            logger.debug("Image decoded successfully.")
            return np.array(image)
        except Exception as e:
            logger.error(f"Image decoding failed: {e}")
            raise ValueError(f"Invalid image data: {str(e)}")
        
    def _compute_beta(self, steps: int, schedule: str = "linear") -> np.ndarray:
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
        assert steps <= 1000,(ValueError("Maximum allowed steps are 1000"))
        if schedule == "linear":
            beta = np.linspace(0.001, 0.02, 1000)[:steps]
        elif schedule == "cosine":
            t = np.linspace(0, np.pi / 2, 1000)[:steps]
            beta = np.sin(t) ** 2 * 0.02
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
            float: Product of alphas over the steps.

        Raises:
            ValueError: If an unsupported schedule is provided.
        """
        if schedule == "linear":
            beta = np.linspace(0.001, 0.02, 1000)[:steps]
        elif schedule == "cosine":
            t = np.linspace(0, np.pi / 2, 1000)[:steps]
            beta = np.sin(t) ** 2 * 0.02
        else:
            logger.error(f"Unsupported beta schedule: {schedule}")
            raise ValueError("Unsupported beta schedule. Use 'linear' or 'cosine'.")

        alphas = 1 - beta
        alphas_bar = np.cumprod(alphas)[-1]
        logger.debug(f"Computed alphas_bar: {alphas_bar:.4f}")
        return alphas_bar

    def fast_diffuse(self) -> np.ndarray:
        """
        Applies fast forward diffusion (adds noise) to the input image.

        Returns:
            np.ndarray: Noised image as a uint8 array in the range [0, 255].
        """
        epsilon = np.random.randn(*self.img_shape)
        xt = (
            np.sqrt(self.alphas_bar) * self.normalized_img
            + np.sqrt(1 - self.alphas_bar) * epsilon
        )
        xt_normalized = (xt - xt.min()) / (xt.max() - xt.min())
        xt_scaled = (xt_normalized * 255).astype(np.uint8)

        logger.info("Fast-Diffusion process completed.")
        return xt_scaled
    
    def diffuse(self) -> np.ndarray:
        """
        """
        xt = self.normalized_img
        for i in range(self.steps):
            epsilon = np.random.randn(*self.img_shape)
            xt = (
                np.sqrt(1 - self.beta[i]) * xt
                + np.sqrt(self.beta[i]) * epsilon
                )
        xt_normalized = (xt - xt.min()) / (xt.max() - xt.min())
        xt_scaled = (xt_normalized * 255).astype(np.uint8)
        logger.info("Diffusion process completed.")
        return xt_scaled

    def display(self, image):
        fig, axes = plt.subplots(1, 2, figsize=(15,10))
        axes[1].imshow(image)
        axes[1].set_title('Processed Image')
        axes[0].imshow(self.img)
        plt.show()



def main():
    with open("img97.jpg", 'rb') as img:
        encoded = base64.b64encode(img.read())
        encoded_str = encoded.decode('utf-8')

    inst = Diffusion(encoded_str, 50, beta_schedule="linear")
    img = inst.diffuse()
    inst.display(img)

if __name__=="__main__":
    main()