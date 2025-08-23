import numpy as np
import logging
import base64
from PIL import Image
from io import BytesIO

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class ImageProcessor:
    """
    A class to process images encoded as base64 strings.

    This class provides functionality to decode a base64-encoded image
    string into a NumPy array and retrieve image properties such as size and shape.

    Attributes:
        encoded_img (str): The base64-encoded image string.
        _decoded_image (np.ndarray or None): Cached decoded image array, initially None.

    Example:
        >>> processor = ImageProcessor(encoded_image_string)
        >>> image_array = processor.decode_image()
        >>> height, width = processor.get_size()
    """
    def __init__(self, encoded_img: str):
        """
        Initializes the ImageProcessor with a base64-encoded image string.

        Args:
            encoded_img (str): The base64-encoded representation of an image.
        """
        self.encoded_img = encoded_img
        self._decoded_image = None

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
        

    def decode_image(self) -> np.ndarray:
        """
        Decodes the base64 image string and returns the image and its shape.

        Returns:
            np.ndarray: Decoded image array
        """    
        self._decoded_image = self._decode_image(self.encoded_img)
        return self._decoded_image
    
    def get_shape(self) -> tuple:
        """
        Returns the shape of the decoded image as a tuple.

        The shape tuple typically has the format (height, width, channels).

        Raises:
            RuntimeError: If the image has not been decoded yet (i.e., 
                        `decode_image()` has not been called).
            ValueError: If there is any issue accessing the image shape.

        Returns:
            tuple: The shape of the decoded image array.
        """
        try:
            if self._decoded_image is None:
                raise RuntimeError("Image not decoded yet. Please call decode_image() first")
            return self._decoded_image.shape
        except Exception as e:
            raise ValueError(f"Invalid image data: {str(e)}")