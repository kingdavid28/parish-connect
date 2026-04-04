<?php
declare(strict_types=1);

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../middleware/auth.php';

function handleRecords(string $method, string $type, ?string $id): void {
    match (true) {
        $method === 'GET'  && $type === 'baptism' && !$id => listBaptismRecords(),
        $method === 'POST' && $type === 'baptism' && !$id => createBaptismRecord(),
        default => jsonResponse(['success' => false, 'message' => 'Not found'], 404),
    };
    exit;
}

function listBaptismRecords(): void {
    authenticate();

    $search = trim($_GET['search'] ?? '');
    $year   = (int)($_GET['year'] ?? 0);
    $page   = max(1, (int)($_GET['page'] ?? 1));
    $limit  = min(50, max(1, (int)($_GET['limit'] ?? 20)));
    $offset = ($page - 1) * $limit;

    try {
        $db     = getDB();
        $where  = 'WHERE 1=1';
        $params = [];

        if ($search) {
            $where   .= ' AND (full_name LIKE ? OR father_name LIKE ? OR mother_name LIKE ? OR record_number LIKE ?)';
            $like     = "%$search%";
            $params   = array_merge($params, [$like, $like, $like, $like]);
        }

        if ($year > 0) {
            $where    .= ' AND YEAR(baptism_date) = ?';
            $params[]  = $year;
        }

        $countStmt = $db->prepare("SELECT COUNT(*) AS total FROM baptism_records $where");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetch()['total'];

        $dataStmt = $db->prepare(
            "SELECT * FROM baptism_records $where ORDER BY baptism_date DESC LIMIT ? OFFSET ?"
        );
        $dataStmt->execute(array_merge($params, [$limit, $offset]));
        $items = $dataStmt->fetchAll();

        jsonResponse([
            'success' => true,
            'data'    => [
                'items'    => $items,
                'total'    => $total,
                'page'     => $page,
                'pageSize' => $limit,
                'hasMore'  => ($offset + count($items)) < $total,
            ],
        ]);
    } catch (PDOException $e) {
        error_log('List records error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function createBaptismRecord(): void {
    $user = authenticate();
    requireRole($user, 'admin', 'superadmin');

    $body = getJsonBody();

    $required = ['fullName', 'baptismDate', 'birthDate', 'fatherName', 'motherName', 'godfatherName', 'priest', 'recordNumber'];
    foreach ($required as $field) {
        if (empty($body[$field])) {
            jsonResponse(['success' => false, 'message' => "Missing required field: $field"], 400);
        }
    }

    try {
        $db    = getDB();
        $check = $db->prepare('SELECT id FROM baptism_records WHERE record_number = ? LIMIT 1');
        $check->execute([$body['recordNumber']]);
        if ($check->fetch()) {
            jsonResponse(['success' => false, 'message' => 'Record number already exists'], 409);
        }

        $id = generateUuid();
        $db->prepare(
            'INSERT INTO baptism_records
             (id, full_name, baptism_date, birth_date, father_name, mother_name,
              godfather_name, godmother_name, priest, location, record_number, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
        )->execute([
            $id,
            $body['fullName'],
            $body['baptismDate'],
            $body['birthDate'],
            $body['fatherName'],
            $body['motherName'],
            $body['godfatherName'],
            $body['godmotherName'] ?? null,
            $body['priest'],
            $body['location'] ?? "St. Mary's Catholic Church",
            $body['recordNumber'],
            $user['id'],
        ]);

        $db->prepare(
            'INSERT INTO audit_logs (id, user_id, action, target_type, target_id, ip_address)
             VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([generateUuid(), $user['id'], 'create_record', 'baptism_record', $id, getClientIp()]);

        jsonResponse(['success' => true, 'message' => 'Record created', 'data' => ['id' => $id]], 201);
    } catch (PDOException $e) {
        error_log('Create record error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}
