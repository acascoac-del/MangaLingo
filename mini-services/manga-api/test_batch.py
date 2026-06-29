import base64, json, urllib.request
with open('test_manga_jp.png', 'rb') as f:
    png_b64 = base64.b64encode(f.read()).decode()
body = json.dumps({'images': [png_b64], 'translator': 'groq'}).encode()
req = urllib.request.Request('http://localhost:8000/translate/batch', data=body, headers={'Content-Type': 'application/json'}, method='POST')
try:
    resp = urllib.request.urlopen(req)
    print('Status:', resp.status)
    data = json.loads(resp.read())
    print('Success:', data.get('success'))
    print('Total:', data.get('total'))
    print('Results count:', len(data.get('results', [])))
    for r in data.get('results', []):
        print(f'  [{r["index"]}] success={r["success"]} time={r.get("processing_time_ms")}ms')
except urllib.error.HTTPError as e:
    print('Error:', e.code, e.read().decode()[:500])
