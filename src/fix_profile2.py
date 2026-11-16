path = "src/app/pages/Profile.tsx"
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()
result = []
i = 0
while i < len(lines):
    line = lines[i].rstrip("\n")
    if "<Input placeholder=" in line and "onKeyDown" in line and "id=" not in line:
        result.append("<Input\n")
        result.append("  id=\"new-message\"\n")
        result.append("  name=\"newMessage\"\n")
        result.append("  placeholder=\"Type a message...\"\n")
        result.append("  value={newMessage}\n")
        result.append("  onChange={(e) => setNewMessage(e.target.value)}\n")
        result.append("  onKeyDown={(e) => e.key === ' + chr(39) + "Enter" + chr(39) + " && handleSendMessage()}\n")
        result.append("/>\n")
        i += 1
        continue
    result.append(line)
    i += 1
with open(path, "w", encoding="utf-8") as f:
    f.writelines(result)
print("Done")
