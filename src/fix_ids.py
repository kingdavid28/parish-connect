path = "src/app/pages/FinancePanel.tsx"
with open(path, "r", encoding="utf-8") as f:
    lines = f.readlines()
result = []
i = 0
while i < len(lines):
    line = lines[i].rstrip("\n")
    if "<Input value={donorSearch}" in line and "placeholder" not in line:
        result.append("<Input\n")
        result.append("  id=\"donor-search\"\n")
        result.append("  name=\"donorSearch\"\n")
        result.append("  value={donorSearch}\n")
        result.append("  onChange={(e) => { setDonorSearch(e.target.value); setDonorPage(1); }}\n")
        if i+1 < len(lines) and "placeholder" in lines[i+1]:
            result.append("  " + lines[i+1])
        else:
            result.append("  placeholder=\"Search name or address...\"\n")
        if i+2 < len(lines) and "className" in lines[i+2]:
            result.append("  " + lines[i+2])
        else:
            result.append("  className=\"pl-8 h-9 w-[200px]\"\n")
        if i+3 < len(lines) and "aria-label" in lines[i+3]:
            result.append("  " + lines[i+3])
        else:
            result.append("  aria-label=\"Search donors\" />\n")
        i += 4
        continue
    result.append(line)
    i += 1
with open(path, "w", encoding="utf-8") as f:
    f.writelines(result)
print("Done")
