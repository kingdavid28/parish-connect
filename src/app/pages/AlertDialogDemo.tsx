import React, { useState } from "react";
import { DeleteButton } from "../components/DeleteButton";
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
} from "../components/ui/alert-dialog";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { toast } from "sonner";
import { Trash2, AlertTriangle, LogOut, Archive } from "lucide-react";

export default function AlertDialogDemo() {
  const [deletedItems, setDeletedItems] = useState<string[]>([]);

  const handleDelete = (itemName: string) => {
    setDeletedItems([...deletedItems, itemName]);
    toast.success(`${itemName} deleted successfully`);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Alert Dialog Examples
        </h1>
        <p className="text-gray-600">
          Radix UI Alert Dialog component with various configurations
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Basic Delete Button */}
        <Card>
          <CardHeader>
            <CardTitle>Basic Delete Button</CardTitle>
            <CardDescription>
              Simple delete confirmation with default styling
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteButton
              itemName="user account"
              onConfirm={() => handleDelete("User account")}
            />
          </CardContent>
        </Card>

        {/* Custom Delete Button */}
        <Card>
          <CardHeader>
            <CardTitle>Custom Delete Button</CardTitle>
            <CardDescription>
              Delete button with custom title and description
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteButton
              itemName="baptismal record"
              title="Delete Baptismal Record?"
              description="This will permanently remove the baptismal record from the parish database. This action cannot be undone and may affect family lineage connections."
              onConfirm={() => handleDelete("Baptismal record")}
            />
          </CardContent>
        </Card>

        {/* Icon Only Delete Button */}
        <Card>
          <CardHeader>
            <CardTitle>Icon Only</CardTitle>
            <CardDescription>Delete button with icon only (size="icon")</CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteButton
              itemName="parish event"
              size="icon"
              onConfirm={() => handleDelete("Parish event")}
            >
              <Trash2 className="h-4 w-4" />
            </DeleteButton>
          </CardContent>
        </Card>

        {/* Ghost Variant */}
        <Card>
          <CardHeader>
            <CardTitle>Ghost Variant</CardTitle>
            <CardDescription>
              Subtle delete button for inline actions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeleteButton
              itemName="comment"
              variant="ghost"
              size="sm"
              onConfirm={() => handleDelete("Comment")}
            />
          </CardContent>
        </Card>

        {/* Custom Alert Dialog - Logout */}
        <Card>
          <CardHeader>
            <CardTitle>Custom Alert - Logout</CardTitle>
            <CardDescription>
              Alert dialog for non-destructive actions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline">
                  <LogOut className="h-4 w-4 mr-2" />
                  Logout
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Logout Confirmation</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to logout? You'll need to sign in again to
                    access your account.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => toast.info("Logged out successfully")}
                  >
                    Logout
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        {/* Custom Alert Dialog - Warning */}
        <Card>
          <CardHeader>
            <CardTitle>Warning Alert</CardTitle>
            <CardDescription>Alert with warning icon and styling</CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-amber-600">
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Revoke Admin Access
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <div className="flex items-start gap-4">
                    <div className="bg-amber-100 p-2 rounded-full">
                      <AlertTriangle className="h-6 w-6 text-amber-600" />
                    </div>
                    <div className="flex-1">
                      <AlertDialogTitle>Revoke Administrator Access?</AlertDialogTitle>
                      <AlertDialogDescription className="mt-2">
                        This user will lose all administrative privileges. They will
                        only have standard parishioner access. You can grant admin
                        access again later if needed.
                      </AlertDialogDescription>
                    </div>
                  </div>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep Access</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => toast.success("Admin access revoked")}
                    className="bg-amber-600 hover:bg-amber-700"
                  >
                    Revoke Access
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        {/* Archive Action */}
        <Card>
          <CardHeader>
            <CardTitle>Archive Action</CardTitle>
            <CardDescription>
              Confirmation for reversible actions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="secondary">
                  <Archive className="h-4 w-4 mr-2" />
                  Archive Post
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Archive this post?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This post will be moved to the archive and won't appear in the
                    main feed. You can restore it from the archive at any time.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => toast.success("Post archived")}
                  >
                    Archive Post
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        {/* Multiple Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Multiple Actions</CardTitle>
            <CardDescription>
              Alert with more than two action buttons
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button>Process Membership Application</Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Review Membership Application</AlertDialogTitle>
                  <AlertDialogDescription>
                    John Doe has applied for parish membership. How would you like
                    to proceed?
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter className="flex-col sm:flex-row gap-2">
                  <AlertDialogCancel className="sm:flex-1">
                    Review Later
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => toast.error("Application rejected")}
                    className="sm:flex-1 bg-red-600 hover:bg-red-700"
                  >
                    Reject
                  </AlertDialogAction>
                  <AlertDialogAction
                    onClick={() => toast.success("Application approved")}
                    className="sm:flex-1 bg-green-600 hover:bg-green-700"
                  >
                    Approve
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>

      {/* Deleted Items Log */}
      {deletedItems.length > 0 && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Deleted Items Log</CardTitle>
            <CardDescription>
              Items that have been deleted in this demo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {deletedItems.map((item, index) => (
                <li key={index} className="flex items-center gap-2 text-sm text-gray-600">
                  <Trash2 className="h-4 w-4 text-red-500" />
                  {item}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
