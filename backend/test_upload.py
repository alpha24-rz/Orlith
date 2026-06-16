import requests

url = "http://localhost:8000/documents/upload"
data = {"workspace_id": "test", "ocr": "false"}
files = {"file": ("test.txt", b"Hello World")}
response = requests.post(url, data=data, files=files)
print(response.status_code)
print(response.text)
