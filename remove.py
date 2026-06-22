import sys
content = sys.stdin.read()
lines = content.split('\n')
new_lines = [line for line in lines if not line.startswith('Co-Authored-By: Claude')]
sys.stdout.write('\n'.join(new_lines))
