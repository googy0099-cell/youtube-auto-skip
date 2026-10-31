"""Build distribution archives from an explicit allowlist; no personal logs."""
from pathlib import Path
import hashlib
import json
import struct
import zlib
import zipfile

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'youtube-auto-skip'
VERSION = json.loads((SOURCE / 'manifest.json').read_text())['version']
OUT = ROOT / 'release' / VERSION
OUT.mkdir(parents=True, exist_ok=True)

def png_icon(size):
    # Original geometric fast-forward mark, no YouTube logo or external artwork.
    pixels = []
    def triangle(x, y, left, right, top, bottom):
        return left <= x <= right and abs(y - (top + bottom) / 2) <= ((bottom-top)/2) * (1-(x-left)/(right-left))
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            px, py = (x + .5)/size, (y + .5)/size
            ink = (triangle(px,py,.24,.49,.25,.75) or
                   triangle(px,py,.45,.70,.25,.75) or
                   (.72 <= px <= .78 and .25 <= py <= .75))
            row.extend((248,250,252,255) if ink else (21,57,89,255))
        pixels.append(bytes(row))
    def chunk(kind, data):
        return struct.pack('!I',len(data))+kind+data+struct.pack('!I',zlib.crc32(kind+data)&0xffffffff)
    return b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('!2I5B',size,size,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(pixels)))+chunk(b'IEND',b'')

payload = {name:(SOURCE/name).read_bytes() for name in [
    'content.js','background.js','worker.js','site-config.js','sites-worker.js',
    'custom-content.js','skip-detector.js','manage.html','manage.css','manage.js'
]}
if (ROOT/'LICENSE').exists():
    payload['LICENSE']=(ROOT/'LICENSE').read_bytes()
manifest = json.loads((SOURCE/'manifest.json').read_text())
manifest['icons'] = {str(n):f'icons/icon{n}.png' for n in [16,32,48,128]}
payload['manifest.json'] = (json.dumps(manifest,indent=2)+'\n').encode()
for n in [16,32,48,128]:
    payload[f'icons/icon{n}.png'] = png_icon(n)

def write_zip(destination, files):
    with zipfile.ZipFile(destination,'w',compression=zipfile.ZIP_DEFLATED) as archive:
        for name,content in sorted(files.items()):
            info=zipfile.ZipInfo(name,date_time=(2026,10,30,0,0,0))
            info.compress_type=zipfile.ZIP_DEFLATED
            info.external_attr=0o100644 << 16
            archive.writestr(info,content)
    with zipfile.ZipFile(destination) as archive:
        assert archive.testzip() is None

store = OUT/f'youtube-auto-skip-{VERSION}-store.zip'
community = OUT/f'youtube-auto-skip-{VERSION}-community.zip'
write_zip(store,payload)
community_files={f'youtube-auto-skip/{name}':data for name,data in payload.items()}
if (ROOT/'LICENSE').exists():
    community_files['LICENSE']=(ROOT/'LICENSE').read_bytes()
community_files['README.md']=(ROOT/'distribution'/'INSTALL-EN.md').read_bytes()
community_files['youtube-auto-skip/README.md']=(ROOT/'distribution'/'INSTALL-EN.md').read_bytes()
for name in ['INSTALL-EN.md','INSTALL-TH.md','PRIVACY-EN.md','PRIVACY.md','SUPPORTED-SITES.md']:
    community_files[name]=(ROOT/'distribution'/name).read_bytes()
write_zip(community,community_files)
for name in ['INSTALL-EN.md','INSTALL-TH.md','PRIVACY-EN.md','PRIVACY.md','SUPPORTED-SITES.md']:
    (OUT/name).write_bytes((ROOT/'distribution'/name).read_bytes())
(OUT/'SHA256SUMS.txt').write_text(''.join(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}\n' for p in [community,store]))
with zipfile.ZipFile(store) as archive:
    staged=json.loads(archive.read('manifest.json'))
    for name in [staged['background']['service_worker'], *[file for entry in staged['content_scripts'] for file in entry['js']], *staged['icons'].values()]:
        assert name in archive.namelist(), name
    assert staged['permissions']==['debugger','storage','scripting','activeTab']
    assert staged['optional_host_permissions']==['https://*/*','http://*/*']
    assert not staged.get('host_permissions')
    assert len(staged['content_scripts']) == 1
    assert staged['content_scripts'][0]['matches'] == ['https://www.youtube.com/*','https://m.youtube.com/*']
    for name in ['worker.js','site-config.js','background.js','sites-worker.js','custom-content.js','manage.html','manage.css','manage.js']:
        assert name in archive.namelist(), name
    assert 'jw-content.js' not in archive.namelist()
print(f'Built and verified {community.name} and {store.name} in {OUT}')
