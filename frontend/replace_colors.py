import os
import re

mapping = {
    # Backgrounds
    r'bg-\[\#0A0A0F\](\/[0-9]+)?': 'bg-background',
    r'bg-\[\#0E0E16\]': 'bg-background',
    r'bg-\[\#111118\]': 'bg-bg-panel',
    r'bg-\[\#16161F\](\/[0-9]+)?': 'bg-bg-input',
    r'bg-\[\#1C1C28\]': 'bg-bg-hover',
    r'bg-\[\#1A1A24\]': 'bg-bg-hover',

    # Borders
    r'border-\[\#1E1E2E\]': 'border-border-subtle',
    r'border-\[\#2A2A3A\]': 'border-border-strong',
    r'border-\[\#3A3A4E\]': 'border-border-strong',

    # Text
    r'text-\[\#5A5A72\]': 'text-text-muted',
    r'text-\[\#9090A8\]': 'text-text-subtle',
    r'text-\[\#C4C4D4\]': 'text-foreground/80',
    r'text-\[\#E8E8FF\]': 'text-foreground',

    # Special rules for fill / scrollbar etc
    r'fill-\[\#2A2A3A\]': 'fill-border-strong',
    r'scrollbar-thumb-\[\#2A2A3A\]': 'scrollbar-thumb-border-strong',
    
    # Hover states
    r'hover:bg-\[\#1C1C28\]': 'hover:bg-bg-hover',
    r'hover:border-\[\#3A3A4E\]': 'hover:border-border-strong',
}

def process_file(filepath):
    with open(filepath, 'r') as f:
        content = f.read()
    
    new_content = content
    for pattern, replacement in mapping.items():
        new_content = re.sub(pattern, replacement, new_content)
        
    if new_content != content:
        with open(filepath, 'w') as f:
            f.write(new_content)
        print(f"Updated {filepath}")

def main():
    dashboard_dir = '/home/alpha/Documents/documind-ai/frontend/app/dashboard'
    for root, dirs, files in os.walk(dashboard_dir):
        for file in files:
            if file.endswith('.tsx'):
                process_file(os.path.join(root, file))

if __name__ == '__main__':
    main()
