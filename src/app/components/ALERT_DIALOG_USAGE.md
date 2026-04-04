# Alert Dialog Usage Guide

## Overview

This project uses Radix UI's Alert Dialog component for confirmation dialogs, styled with Tailwind CSS. The components are located in `src/app/components/ui/alert-dialog.tsx`.

## Quick Start - Using DeleteButton Component

The `DeleteButton` component is a reusable wrapper that provides a simple API for delete confirmations:

```tsx
import { DeleteButton } from "./components/DeleteButton";

// Basic usage
<DeleteButton
  itemName="user account"
  onConfirm={() => handleDelete()}
/>

// With custom title and description
<DeleteButton
  itemName="baptismal record"
  title="Delete Baptismal Record?"
  description="This will permanently remove the record from the database."
  onConfirm={() => handleDelete()}
  variant="destructive"
  size="sm"
/>

// Icon only
<DeleteButton
  itemName="comment"
  size="icon"
  onConfirm={() => handleDelete()}
>
  <Trash2 className="h-4 w-4" />
</DeleteButton>
```

### Props

- `itemName` (string, optional): Name of the item being deleted. Default: "this item"
- `title` (string, optional): Dialog title. Default: "Are you absolutely sure?"
- `description` (string, optional): Dialog description. Default: auto-generated from itemName
- `onConfirm` (function, required): Callback function when user confirms deletion
- `variant` (string, optional): Button variant. Default: "destructive"
- `size` (string, optional): Button size. Default: "default"
- `children` (ReactNode, optional): Custom button content

## Manual Usage - Custom Alert Dialogs

For more control, use the AlertDialog components directly:

```tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "./components/ui/alert-dialog";
import { Button } from "./components/ui/button";

<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="destructive">Delete Item</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
      <AlertDialogDescription>
        This action cannot be undone. This will permanently delete your data.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction
        onClick={() => handleDelete()}
        className="bg-red-600 hover:bg-red-700"
      >
        Yes, delete
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

## Controlled State

You can control the dialog state manually:

```tsx
const [open, setOpen] = useState(false);

<AlertDialog open={open} onOpenChange={setOpen}>
  {/* ... */}
  <AlertDialogAction onClick={() => {
    handleAction();
    setOpen(false);
  }}>
    Confirm
  </AlertDialogAction>
</AlertDialog>
```

## Examples in Codebase

- **AdminManagement.tsx** (lines 480-500): Delete user confirmation
- **AlertDialogDemo.tsx**: Complete demo page with 8+ examples

## Demo Page

Visit `/demo/alert-dialog` to see all examples in action.

## Styling

The AlertDialog components use Tailwind CSS classes and can be customized via the `className` prop. The default styling includes:

- Backdrop overlay with fade animation
- Centered modal with zoom animation
- Responsive sizing (max-width adapts to screen size)
- Accessible keyboard navigation

## Accessibility

The Alert Dialog component is built with accessibility in mind:

- Focus trap when open
- ESC key to close
- Screen reader friendly
- Keyboard navigation support
- ARIA attributes included
