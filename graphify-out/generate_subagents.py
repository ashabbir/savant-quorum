import json
from pathlib import Path

# Load chunks
chunks_info = json.loads(Path('graphify-out/.graphify_chunks_info.json').read_text(encoding='utf-8'))
non_image_chunks = chunks_info['non_image_chunks']
image_chunks = chunks_info['image_chunks']
all_chunks = non_image_chunks + image_chunks

total_chunks = len(all_chunks)
subagents = []

# Template prompt
spec = Path('/Users/home/.gemini/skills/graphify/references/extraction-spec.md').read_text(encoding='utf-8')
# Find the prompt part starting with 'You are a graphify extraction subagent.'
start_idx = spec.find('You are a graphify extraction subagent.')
template = spec[start_idx:].strip().rstrip('\n```')

project_root = '/Users/home/code/project-x/savant-quorum'

for idx, chunk in enumerate(all_chunks):
    chunk_num = idx + 1
    file_list = '\n'.join(chunk)
    chunk_path = f'{project_root}/graphify-out/.graphify_chunk_{chunk_num:02d}.json'
    
    prompt = template.replace('CHUNK_NUM', str(chunk_num))
    prompt = prompt.replace('TOTAL_CHUNKS', str(total_chunks))
    prompt = prompt.replace('FILE_LIST', file_list)
    prompt = prompt.replace('DEEP_MODE', 'False') # default mode is not deep since --mode deep wasn't in command
    prompt = prompt.replace('CHUNK_PATH', chunk_path)
    
    subagents.append({
        'TypeName': 'general-purpose',
        'Role': f'Semantic Extractor Chunk {chunk_num:02d}',
        'Prompt': prompt
    })

# Output JSON
Path('graphify-out/.graphify_subagents.json').write_text(json.dumps(subagents, indent=2), encoding='utf-8')
print("Saved subagents config to graphify-out/.graphify_subagents.json")
