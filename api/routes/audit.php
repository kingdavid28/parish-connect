<?php
declare(strict_types=1);

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../middleware/auth.php';

function handleAudit(string $method, ?string $id): void {
    match (true) {
        $method === 'GET' && !$id => listAuditLogs(),
        default => jsonResponse(['success' => false, 'message' => 'Not found'], 404),
    };
    exit;
}

function listAuditLogs(): void {
    $admin = authenticate();
    requireRole($admin, 'admin', 'superadmin');

    $page   = max(1, (int)($_GET['page']   ?? 1));
    $limit  = min(100, max(1, (int)($_GET['limit'] ?? 50)));
    $offset = ($page - 1) * $limit;
    $action = trim($_GET['action'] ?? '');
    $userId = trim($_GET['user_id'] ?? '');
    $from   = trim($_GET['from']    ?? '');
    $to     = trim($_GET['to']      ?? '');

    try {
        $db     = getDB();
        $where  = 'WHERE 1=1';
        $params = [];

        if ($action) {
            $where   .= ' AND al.action = ?';
            $params[] = $action;
        }
        if ($userId) {
            $where   .= ' AND al.user_id = ?';
            $params[] = $userId;
        }
        if ($from) {
            $where   .= ' AND al.created_at >= ?';
            $params[] = $from . ' 00:00:00';
        }
        if ($to) {
            $where   .= ' AND al.created_at <= ?';
            $params[] = $to . ' 23:59:59';
        }

        // Total count
        $countStmt = $db->prepare("SELECT COUNT(*) FROM audit_logs al $where");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetchColumn();

        // Data
        $dataStmt = $db->prepare(
            "SELECT al.id, al.action, al.target_type, al.target_id,
                    al.ip_address, al.created_at,
                    u.name AS user_name, u.email AS user_email, u.role AS user_role,
                    t.name AS target_name
             FROM audit_logs al
             LEFT JOIN users u  ON u.id  = al.user_id
             LEFT JOIN users t  ON t.id  = al.target_id AND al.target_type = 'user'
             $where
             ORDER BY al.created_at DESC
             LIMIT ? OFFSET ?"
        );
        $dataStmt->execute(array_merge($params, [$limit, $offset]));
        $logs = $dataStmt->fetchAll();

        // Distinct actions for filter dropdown
        $actionsStmt = $db->query("SELECT DISTINCT action FROM audit_logs ORDER BY action ASC");
        $actions = $actionsStmt->fetchAll(PDO::FETCH_COLUMN);

        jsonResponse([
            'success' => true,
            'data'    => [
                'logs'    => $logs,
                'total'   => $total,
                'page'    => $page,
                'limit'   => $limit,
                'hasMore' => ($offset + count($logs)) < $total,
                'actions' => $actions,
            ],
        ]);
    } catch (PDOException $e) {
        error_log('listAuditLogs error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}
