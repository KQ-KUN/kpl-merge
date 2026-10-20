"""Explicit, repeatable AAC-LC packaging; immutable originals stay outside public."""
import argparse
import hashlib
import json
import shutil
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()


def probe(exe, path):
    return json.loads(subprocess.check_output([str(exe), '-v', 'error', '-show_entries',
        'format=duration,size,bit_rate:stream=codec_name,profile,sample_rate,channels,bit_rate', '-of', 'json', str(path)]))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--ffmpeg-dir', type=Path, required=True)
    parser.add_argument('--source-commit', required=True)
    parser.add_argument('--samples-dir', type=Path, required=True)
    args = parser.parse_args()
    ffmpeg, ffprobe = (args.ffmpeg_dir / f'{name}.exe' for name in ('ffmpeg', 'ffprobe'))
    if len(args.source_commit) != 40: parser.error('source-commit must identify the frozen consumer snapshot')
    original_root = ROOT / 'audio-originals'
    original_manifest = original_root / 'manifest.json'
    snapshot = json.loads((ROOT / 'src/data/teams.json').read_text('utf8'))
    provenance = json.loads((ROOT / 'docs/data-provenance.json').read_text('utf8'))
    if original_manifest.exists():
        originals = json.loads(original_manifest.read_text('utf8'))
    else:
        originals = {'sourceCommit': args.source_commit, 'files': [], 'teams': snapshot, 'provenance': provenance}
        for team in snapshot['teams']:
            for key in ('anthem', 'childAnthem'):
                resource = team.get(key)
                if not resource: continue
                source = ROOT / 'public' / resource
                target = original_root / resource
                target.parent.mkdir(parents=True, exist_ok=True)
                if target.exists(): raise ValueError(f'Untracked original exists, refusing overwrite: {target}')
                shutil.copyfile(source, target)
                target.chmod(0o444)
                originals['files'].append({'path': resource, 'sha256': sha(target), 'bytes': target.stat().st_size,
                    'media': probe(ffprobe, target)})
        original_manifest.parent.mkdir(parents=True, exist_ok=True)
        original_manifest.write_text(json.dumps(originals, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    if originals['sourceCommit'] != args.source_commit: raise ValueError('Original provenance source commit differs')
    # Repeated preparation always derives from archived facts, never from the lossy runtime copy.
    snapshot = json.loads(json.dumps(originals['teams']))
    provenance = json.loads(json.dumps(originals['provenance']))
    for item in originals['files']:
        if sha(original_root / item['path']) != item['sha256']: raise ValueError('Original modified; abort')
    args.samples_dir.mkdir(parents=True, exist_ok=True)
    samples = []
    for variant in ('normal', 'child'):
        original = next(item for item in originals['files'] if item['path'].startswith(f'team-audio/{variant}/'))
        for bitrate in (64, 96, 128):
            target = args.samples_dir / f'{variant}-{bitrate}k.m4a'
            cue = 36.2 if variant == 'normal' else 1
            subprocess.run([str(ffmpeg), '-y', '-v', 'error', '-ss', str(cue), '-i', str(original_root / original['path']),
                '-t', '30', '-map', '0:a:0', '-vn', '-map_metadata', '-1', '-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', f'{bitrate}k',
                '-ar', '44100', '-ac', '2', '-movflags', '+faststart', str(target)], check=True)
            samples.append({'path': str(target.resolve()), 'kbps': bitrate, 'media': probe(ffprobe, target), 'sha256': sha(target)})
    metrics = []
    for item in originals['files']:
        original = original_root / item['path']
        resource = str(Path(item['path']).with_suffix('.m4a')).replace('\\', '/')
        target = ROOT / 'public' / resource
        target.parent.mkdir(parents=True, exist_ok=True)
        stream = next(stream for stream in item['media']['streams'] if stream['codec_name'] in ('aac', 'mp3'))
        copy_aac = stream['codec_name'] == 'aac' and stream.get('profile') == 'LC' and int(stream.get('bit_rate', 0)) in range(1, 100001)
        codec_options = ['-c:a', 'copy'] if copy_aac else ['-c:a', 'aac', '-profile:a', 'aac_low', '-b:a', '96k', '-ar', '44100', '-ac', '2']
        subprocess.run([str(ffmpeg), '-y', '-v', 'error', '-i', str(original), '-map', '0:a:0', '-vn', '-map_metadata', '-1',
            *codec_options, '-movflags', '+faststart', str(target)], check=True)
        media = probe(ffprobe, target)
        if len(media['streams']) != 1 or media['streams'][0]['codec_name'] != 'aac' or media['streams'][0]['profile'] != 'LC': raise ValueError('Unexpected codec')
        delta = abs(float(media['format']['duration']) - float(item['media']['format']['duration']))
        if delta > .1: raise ValueError(f'duration changed: {resource} {delta}')
        asset = provenance['audio']['files'].pop(item['path'].removeprefix('team-audio/'))
        provenance['audio']['files'][resource.removeprefix('team-audio/')] = {**asset, 'originalSha256': item['sha256'],
            'sha256': sha(target), 'bytes': target.stat().st_size, 'media': {**asset['media'], 'durationSeconds': float(media['format']['duration'])},
            'processing': ('Existing low-bitrate AAC-LC bitstream copy' if copy_aac else 'AAC-LC 96 kbps stereo 44100 Hz encode') + ', audio-only faststart; immutable original retained outside public'}
        for team in snapshot['teams']:
            for key in ('anthem', 'childAnthem'):
                if team.get(key) == item['path']: team[key] = resource
        metrics.append({'original': item, 'runtime': {'path': resource, 'bytes': target.stat().st_size, 'sha256': sha(target), 'media': media}, 'durationDeltaSeconds': delta, 'bitstreamCopied': copy_aac})
        if resource != item['path']:
            old = ROOT / 'public' / item['path']
            if old.exists() and sha(old) == item['sha256']: old.unlink()  # Exact manifest-managed original now safely archived.
    (ROOT / 'src/data/teams.json').write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    (ROOT / 'docs/data-provenance.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    cues_path = ROOT / 'docs/AUDIO_CUES_CURRENT.json'
    cues_source = cues_path if cues_path.exists() else ROOT / 'docs/AUDIO_CUES_20261008.json'
    cues = json.loads(cues_source.read_text('utf8'))
    for cue in cues['cues']:
        team = next(t for t in snapshot['teams'] if t['id'] == cue['id'])
        cue.setdefault('originalSha256', cue['sha256']); cue['sha256'] = sha(ROOT / 'public' / team['anthem'])
    cues_path.write_text(json.dumps(cues, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    outputs = [ROOT / 'src/data/teams.json', *sorted((ROOT / 'public/team-audio').rglob('*.m4a')), *sorted((ROOT / 'public/team-icons').glob('*.png'))]
    manifest = {'schemaVersion': 1, 'sourceCommit': args.source_commit, 'generatedAt': datetime.now(timezone.utc).isoformat().replace('+00:00', 'Z'),
        'inputs': [{'path': 'audio-originals/manifest.json', 'sha256': sha(original_manifest)},
                   *[{'path': 'audio-originals/' + i['path'], 'sha256': i['sha256']} for i in originals['files']]],
        'outputs': [{'path': p.relative_to(ROOT).as_posix(), 'sha256': sha(p), 'bytes': p.stat().st_size} for p in outputs],
        'generator': {'name': 'scripts/prepare-audio.py', 'version': sha(Path(__file__))},
        'coverage': {'teams': len(snapshot['teams']), 'normalTracks': 12, 'childTracks': 8, 'audioTracks': len(metrics)},
        'exclusionRules': ['No default song substitution', 'No full catalogue preload', 'Originals excluded from public and build'],
        'semantics': {'sourceChain': 'frozen Merge consumer files; original provenance preserved', 'cueUnit': 'seconds, unchanged', 'durationUnit': 'seconds', 'bitrateUnit': 'bits per second'},
        'resources': {'originalBytes': sum(i['bytes'] for i in originals['files']), 'runtimeAudioBytes': sum(i['runtime']['bytes'] for i in metrics)},
        'quality': {'encoder': 'AAC-LC 96 kbps target; existing AAC-LC <=100 kbps copied without re-encoding', 'humanListening': False, 'sourceIdentitiesChanged': 0}}
    (ROOT / 'public/data').mkdir(exist_ok=True)
    (ROOT / 'public/data/manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    (ROOT / 'docs/audio-compression.json').write_text(json.dumps({'samples': samples, 'tracks': metrics, 'humanListening': False, **manifest['resources']}, ensure_ascii=False, indent=2) + '\n', encoding='utf8')
    print(json.dumps(manifest['resources']))


if __name__ == '__main__': main()
