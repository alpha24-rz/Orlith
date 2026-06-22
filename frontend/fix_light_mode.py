import os
import re

dashboard_dir = '/home/alpha/Documents/documind-ai/frontend/app/dashboard'

def replace_text_white(match):
    full_class = match.group(0)
    # Check if there's a strong background color in the class list
    # e.g., bg-indigo-600, bg-emerald-500, but NOT bg-indigo-500/10
    if re.search(r'bg-(indigo|emerald|red|rose|blue|amber|purple)-(500|600)(?![0-9/])', full_class):
        return full_class # Keep text-white for strong backgrounds
    
    # Also keep text-white if it's explicitly styling a colored badge
    if 'bg-[#2A2A3A]' in full_class and 'text-white' in full_class:
        pass # Wait, bg-bg-panel in light mode is white.
    
    # Replace text-white variations
    new_class = re.sub(r'\btext-white\b', 'text-foreground', full_class)
    new_class = re.sub(r'\btext-white/(\d+)\b', r'text-foreground/\1', new_class)
    new_class = re.sub(r'\bhover:text-white\b', 'hover:text-foreground', new_class)
    new_class = re.sub(r'\bgroup-hover:text-white\b', 'group-hover:text-foreground', new_class)
    
    return new_class

def main():
    count = 0
    for root, _, files in os.walk(dashboard_dir):
        for f in files:
            if f.endswith('.tsx'):
                path = os.path.join(root, f)
                with open(path, 'r') as file:
                    content = file.read()
                
                # Replace inside className="..."
                new_content = re.sub(r'className="([^"]*)"', replace_text_white, content)
                # Replace inside className={`...`}
                new_content = re.sub(r'className=\{`([^`]*)`\}', replace_text_white, new_content)
                
                if new_content != content:
                    with open(path, 'w') as file:
                        file.write(new_content)
                    print(f"Updated {path}")
                    count += 1
    print(f"Total files updated: {count}")

if __name__ == '__main__':
    main()
