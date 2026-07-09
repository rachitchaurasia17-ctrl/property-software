import os
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
import time

def take_screenshot():
    options = Options()
    options.add_argument('--headless')
    options.add_argument('--window-size=1200,800')
    driver = webdriver.Chrome(options=options)
    
    file_url = f"file:///{os.path.abspath('c:/Users/rachi_l35wosr/OneDrive/Desktop/xyz/3d-block-demo/index.html')}"
    driver.get(file_url)
    time.sleep(2)  # wait for render
    driver.save_screenshot('c:/Users/rachi_l35wosr/OneDrive/Desktop/xyz/3d-block-demo/preview.png')
    driver.quit()

if __name__ == "__main__":
    take_screenshot()
