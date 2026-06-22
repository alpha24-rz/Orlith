import sys

file_path = '/home/alpha/Documents/documind-ai/frontend/app/dashboard/layout.tsx'
with open(file_path, 'r') as f:
    lines = f.readlines()

new_lines = []
skip = False
sidebar_count = 0
for i, line in enumerate(lines):
    # Add the import
    if "import Image from 'next/image'" in line:
        new_lines.append(line)
        new_lines.append("import SideBar from '@/components/SideBar'\n")
        continue
    
    # Skip the old Sidebar function
    if "const Sidebar = () => (" in line:
        skip = True
        continue
    
    if skip:
        # It ends at line 325 which is "  )"
        # We'll detect the end of the return statement.
        if line.strip() == ")" and lines[i+1].strip() == "":
            skip = False
            # also skip the empty line
        continue
        
    # Replace <Sidebar />
    if "<Sidebar />" in line:
        indent = line[:len(line) - len(line.lstrip())]
        new_lines.append(indent + "<SideBar pathname={pathname} onOpenNewWorkspace={() => setNewWorkspaceOpen(true)} onOpenCommandPalette={() => setCommandPaletteOpen(true)} setSidebarOpen={setSidebarOpen} />\n")
        continue

    new_lines.append(line)

with open(file_path, 'w') as f:
    f.writelines(new_lines)

print("Layout updated.")
