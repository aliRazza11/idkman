import numpy as np
import logging
from ImageProcessor import ImageProcessor
from BetaScheduler import BetaScheduler

import base64


logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class Diffusion:
    """
    A class to perform fast forward diffusion on images using a noise schedule.

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
        if steps > 1000 or steps <=1:
            raise ValueError("Allowed step size between 1-1000")
        self.steps = steps
        self.beta_schedule = beta_schedule
        img_processor = ImageProcessor(encoded_img)
        img = img_processor.decode_image()
        self.normalized_img = img / 255.0
        self.img_shape = img_processor.get_shape()
        
        schedule = BetaScheduler(steps, beta_schedule)
        self.beta = schedule.get_beta()

        self.alphas_bar = schedule.get_alpha_bar()

        logger.info(f"Initialized Diffusion with shape {self.img_shape}, "
                    f"{steps} steps, beta schedule '{beta_schedule}'")        

    def fast_diffuse(self):
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
        Applies step-by-step forward diffusion (adds noise) to the input image.

        Returns:
            np.ndarray: Noised image as a uint8 array in the range [0, 255].
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
    

def main():

    def display(image):
        import matplotlib.pyplot as plt
        fig, axes = plt.subplots(1, 2, figsize=(15,10))
        axes[1].imshow(image)
        axes[1].set_title('Processed Image')
        # axes[0].imshow(self.img)
        plt.show()

    with open("backend\_tests\images\img97.jpg", 'rb') as img:
        encoded = base64.b64encode(img.read())
        encoded_str = encoded.decode('utf-8')
    inst = Diffusion(encoded_str, 1000)
    diffused = inst.diffuse()
    display(diffused)


if __name__=="__main__":
    main()