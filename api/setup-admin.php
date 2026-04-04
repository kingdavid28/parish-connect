<?php
/**
 * Administrative Setup Script
 * Run this ONCE to seed the super-admin user or reset credentials
 * 
 * Usage: 
 *   php setup-admin.php [action] [email] [password]
 *   php setup-admin.php create reycelrcentino@gmail.com kNooCkk@0228a
 *   php setup-admin.php verify reycelrcentino@gmail.com kNooCkk@0228a
 */

declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', '1');

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

$action = $argv[1] ?? 'help';
$email = strtolower(trim($argv[2] ?? ''));
$password = $argv[3] ?? '';

echo "\n╔════════════════════════════════════════════════════════════════════╗\n";
echo "║          Parish Connect - Admin Setup Script                       ║\n";
echo "╚════════════════════════════════════════════════════════════════════╝\n\n";

// Generate password hash
function hashPassword(string $password): string {
    return password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);
}

// Verify password against hash
function verifyPassword(string $email, string $password): bool {
    try {
        $db = getDB();
        $stmt = $db->prepare('SELECT password_hash FROM users WHERE email = ? LIMIT 1');
        $stmt->execute([$email]);
        $row = $stmt->fetch();
        
        if (!$row) {
            echo "❌ User not found: $email\n\n";
            return false;
        }
        
        $isValid = password_verify($password, $row['password_hash']);
        if ($isValid) {
            echo "✅ Password is correct for: $email\n\n";
        } else {
            echo "❌ Password is INCORRECT for: $email\n\n";
            echo "   Current hash: " . substr($row['password_hash'], 0, 50) . "...\n";
            echo "   Test hash:    " . substr(hashPassword($password), 0, 50) . "...\n\n";
        }
        return $isValid;
    } catch (Exception $e) {
        echo "❌ Error: " . $e->getMessage() . "\n\n";
        return false;
    }
}

// Create or update super-admin user
function createAdmin(string $email, string $password): void {
    if (!$email || !$password) {
        echo "❌ Invalid input. Please provide email and password.\n\n";
        return;
    }
    
    if (strlen($password) < 8) {
        echo "❌ Password must be at least 8 characters long.\n\n";
        return;
    }
    
    try {
        $db = getDB();
        $hash = hashPassword($password);
        $id = 'super-admin-001';
        
        // Check if user exists
        $check = $db->prepare('SELECT id FROM users WHERE id = ? OR email = ? LIMIT 1');
        $check->execute([$id, $email]);
        $exists = $check->fetch();
        
        if ($exists && $exists['id'] !== $id) {
            // Email exists with different ID, delete old record
            $db->prepare('DELETE FROM users WHERE email = ?')->execute([$email]);
        }
        
        if ($exists && $exists['id'] === $id) {
            // Update existing super-admin
            $stmt = $db->prepare(
                'UPDATE users SET 
                    name = ?, email = ?, password_hash = ?, 
                    role = ?, parish_id = ?, is_active = 1, updated_at = NOW()
                 WHERE id = ?'
            );
            $stmt->execute([
                'Super Administrator',
                $email,
                $hash,
                'superadmin',
                'st-marys',
                $id
            ]);
            echo "✅ Super-admin user UPDATED successfully!\n\n";
        } else {
            // Create new super-admin
            $stmt = $db->prepare(
                'INSERT INTO users 
                    (id, name, email, password_hash, role, parish_id, is_active, member_since, created_by, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, ?, 1, CURDATE(), ?, NOW(), NOW())'
            );
            $stmt->execute([
                $id,
                'Super Administrator',
                $email,
                $hash,
                'superadmin',
                'st-marys',
                'system'
            ]);
            echo "✅ Super-admin user CREATED successfully!\n\n";
        }
        
        echo "📋 User Details:\n";
        echo "   ID:       $id\n";
        echo "   Email:    $email\n";
        echo "   Password: $password (hashed securely)\n";
        echo "   Role:     superadmin\n";
        echo "   Status:   active\n\n";
        
        echo "🔐 Password Hash (for reference):\n";
        echo "   " . $hash . "\n\n";
        
    } catch (Exception $e) {
        echo "❌ Error: " . $e->getMessage() . "\n\n";
    }
}

// Display help
function showHelp(): void {
    echo "Available commands:\n\n";
    echo "  php setup-admin.php create <email> <password>\n";
    echo "    Create or update the super-admin user\n";
    echo "    Example: php setup-admin.php create reycelrcentino@gmail.com kNooCkk@0228a\n\n";
    
    echo "  php setup-admin.php verify <email> <password>\n";
    echo "    Verify if a password matches the stored hash\n";
    echo "    Example: php setup-admin.php verify reycelrcentino@gmail.com kNooCkk@0228a\n\n";
    
    echo "  php setup-admin.php hash <password>\n";
    echo "    Generate a bcrypt hash for a password\n";
    echo "    Example: php setup-admin.php hash kNooCkk@0228a\n\n";
}

// Route to correct action
if ($action === 'create') {
    createAdmin($email, $password);
} elseif ($action === 'verify') {
    verifyPassword($email, $password);
} elseif ($action === 'hash') {
    if ($password) {
        echo "Hash for '$password':\n" . hashPassword($password) . "\n\n";
    } else {
        echo "❌ No password provided\n\n";
    }
} else {
    showHelp();
}
