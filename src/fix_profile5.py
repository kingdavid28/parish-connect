path = 'src/app/pages/Profile.tsx'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old = '''<Input placeholder="Type a message..." value={newMessage} onChange={(e) => setNewMessage(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()} />'''

new = '''<Input
  id="new-message"
  name="newMessage"
  placeholder="Type a message..."
  value={newMessage}
  onChange={(e) => setNewMessage(e.target.value)}
  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
/>'''

if old in content:
    content = content.replace(old, new)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('Done')
else:
    print('Not found')
