path = 'src/app/pages/Profile.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()
old_start = '<Input placeholder="Type a message...'
old_end = 'handleSendMessage() />'
if old_start in content:
    # Find and replace
    idx = content.find(old_start)
    end_idx = content.find(old_end, idx)
    if end_idx != -1:
        end_idx += len('handleSendMessage() />')
        new_block = '''<Input
  id="new-message"
  name="newMessage"
  placeholder="Type a message..."
  value={newMessage}
  onChange={(e) => setNewMessage(e.target.value)}
  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
/>'''
        content = content[:idx] + new_block + content[end_idx:]
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print('Done')
else:
    print('Not found')
