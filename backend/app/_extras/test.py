#!!!NEW!!!
from PIL import Image
import numpy as np
from io import BytesIO
import base64
import matplotlib.pyplot as plt
import time

class Diffusion:

    beta = np.linspace(0.001, 0.02, 1000)

    def __init__(self, encoded_img, steps: int):
        try:
            img_data = base64.b64decode(encoded_img)
            img_stream = BytesIO(img_data)
            img = Image.open(img_stream)
        except Exception as e:
            return f"Invalid image data: {str(e)}"
        
        self.steps = steps
        img_array = np.array(img)
        self.img_shape = img_array.shape
        self.normalized_image_array = self.normalize(img_array)
        # self.normalized_image_array = (img_array - img_array.min()) / (img_array.max() - img_array.min())

        epsilon = np.random.randn(*self.img_shape) 
        self.sqrt_alpha = np.sqrt(1 - self.beta[:self.steps])
        self.sqrt_beta = np.sqrt(self.beta[:self.steps])

    def diffuse(self):
        normalized_image_new = self.normalized_image_array.copy()

        for i in range(self.steps):
            epsilon = np.random.randn(*self.img_shape)
            normalized_image_new *= self.sqrt_alpha[i]
            normalized_image_new += self.sqrt_beta[i] * epsilon

        self.diffused_img = self.normalize(normalized_image_new)
        # self.diffused_img = (normalized_image_new - normalized_image_new.min()) / (normalized_image_new.max() - normalized_image_new.min())
        return self.diffused_img


    def display(self):
        fig, axes = plt.subplots(1, 2, figsize=(15,10))
        axes[1].imshow(self.diffused_img)
        axes[1].set_title('Original Image')
        axes[0].imshow(self.normalized_image_array)
        plt.show()

    @staticmethod
    def normalize(img: np.ndarray):
        return (img - img.min()) / (img.max() - img.min())

if __name__=="__main__":
    with open("img97.jpg", 'rb') as img:
        encoded = base64.b64encode(img.read())
        encoded_str = encoded.decode('utf-8')

    inst = Diffusion(encoded_str, 100)
    inst.diffuse()
    inst.display()