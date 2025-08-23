import numpy as np
from PIL import Image
from io import BytesIO
import base64
import matplotlib.pyplot as plt

class Diffusion:


    def __init__(self, encoded_img, steps: int):
        self.steps = steps
        try:
            decoded_img = base64.b64decode(encoded_img)
            img_stream = BytesIO(decoded_img)
            img_stream = Image.open(img_stream)
        except Exception as e:
            return f"Invalid image data: {str(e)}"

        beta = np.linspace(0.001, 0.02, 1000)
        beta = beta
        alphas = 1 - beta[0:steps]
        # print(alphas)
        self.alphas_bar = np.cumprod(alphas)[-1]
        # print(self.alphas_bar)
        
        self.img = np.array(img_stream)
        self.img_shape = self.img.shape
        self.normalized_img = self.img/255

    def diffuse(self):
        epsilon = np.random.randn(*self.img_shape)
        xt = np.sqrt(self.alphas_bar)*self.normalized_img + np.sqrt(1-self.alphas_bar)*epsilon
        xt_normalized = (xt - xt.min()) / (xt.max() - xt.min())
        self.xt_255 = xt_normalized * 255
        self.xt_255 = np.astype(self.xt_255, int)

    def display(self):
        fig, axes = plt.subplots(1, 2, figsize=(15,10))
        axes[1].imshow(self.xt_255)
        axes[1].set_title('Processed Image')
        axes[0].imshow(self.img)
        plt.show()



def main():
    with open("img97.jpg", 'rb') as img:
        encoded = base64.b64encode(img.read())
        encoded_str = encoded.decode('utf-8')

    inst = Diffusion(encoded_str, 100)
    inst.diffuse()
    inst.display()

if __name__=="__main__":
    main()