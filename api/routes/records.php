<?php
declare(strict_types=1);

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../middleware/auth.php';

function handleRecords(string $method, string $type, ?string $id): void {
    match (true) {
        $method === 'GET'  && $type === 'baptism' && !$id => listBaptismRecords(),
        $method === 'POST' && $type === 'baptism' && !$id => createBaptismRecord(),
        $type === 'marriage' || $type === 'death'       => handleTypedRegistry($method, $type, $id),
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

// ─── Typed registries (marriage / death) ─────────────────────────────────────
// Mirrors backend/src/routes/records.js TYPED_REGISTRIES for the PHP/MySQL API.

function typedRegistryConfig(string $type): ?array {
    $configs = [
        'marriage' => [
            'table'      => 'marriage_records',
            'dateCol'    => 'marriage_date',
            'searchCols' => ['groom_name', 'bride_name', 'record_number', 'contract_no'],
            'fields'     => [
                ['col' => 'groom_name', 'req' => true, 'max' => 200],
                ['col' => 'bride_name', 'req' => true, 'max' => 200],
                ['col' => 'marriage_date', 'req' => true, 'type' => 'date'],
                ['col' => 'groom_father_name', 'max' => 200],
                ['col' => 'groom_mother_name', 'max' => 200],
                ['col' => 'bride_father_name', 'max' => 200],
                ['col' => 'bride_mother_name', 'max' => 200],
                ['col' => 'sponsors_names', 'max' => 400],
                ['col' => 'priest', 'req' => true, 'max' => 200],
                ['col' => 'location', 'max' => 255],
                ['col' => 'record_number', 'req' => true, 'max' => 50],
                ['col' => 'contract_no', 'max' => 100],
                ['col' => 'notes', 'max' => 2000],
            ],
        ],
        'death' => [
            'table'      => 'death_records',
            'dateCol'    => 'death_date',
            'searchCols' => ['full_name', 'spouse_name', 'informant_name', 'record_number'],
            'fields'     => [
                ['col' => 'full_name', 'req' => true, 'max' => 200],
                ['col' => 'death_date', 'req' => true, 'type' => 'date'],
                ['col' => 'birth_date', 'type' => 'date'],
                ['col' => 'age', 'type' => 'int'],
                ['col' => 'residence', 'max' => 255],
                ['col' => 'spouse_name', 'max' => 200],
                ['col' => 'informant_name', 'max' => 200],
                ['col' => 'cause_of_death', 'max' => 255],
                ['col' => 'cemetery', 'max' => 255],
                ['col' => 'priest', 'max' => 200],
                ['col' => 'record_number', 'req' => true, 'max' => 50],
                ['col' => 'notes', 'max' => 2000],
            ],
        ],
    ];
    return $configs[$type] ?? null;
}

function sanitizeTypedField(array $f, array $raw): array {
    $v = $raw[$f['col']] ?? null;
    if ($v === null || trim((string) $v) === '') {
        return !empty($f['req']) ? ['error' => "Missing required field: {$f['col']}"] : ['value' => null];
    }
    $type = $f['type'] ?? 'text';
    if ($type === 'date') {
        $s = trim((string) $v);
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $s)) {
            return ['error' => "{$f['col']} must be a date (YYYY-MM-DD)"];
        }
        [$y, $m, $d] = array_map('intval', explode('-', $s));
        if (!checkdate($m, $d, $y)) {
            return ['error' => "{$f['col']} must be a date (YYYY-MM-DD)"];
        }
        return ['value' => $s];
    }
    if ($type === 'int') {
        $n = filter_var($v, FILTER_VALIDATE_INT);
        if ($n === false || $n < 0 || $n > 150) {
            return ['error' => "{$f['col']} must be a valid age"];
        }
        return ['value' => $n];
    }
    $s = trim((string) $v);
    if (!empty($f['max']) && mb_strlen($s) > $f['max']) {
        return ['error' => "{$f['col']} is too long (max {$f['max']})"];
    }
    return ['value' => $s];
}

function sanitizeTypedRecord(array $cfg, array $raw): array {
    $values = [];
    foreach ($cfg['fields'] as $f) {
        $r = sanitizeTypedField($f, $raw);
        if (isset($r['error'])) return ['error' => $r['error']];
        $values[$f['col']] = $r['value'];
    }
    return ['values' => $values];
}

function typedAudit(string $userId, string $action, string $type, string $recordId): void {
    try {
        getDB()->prepare(
            'INSERT INTO audit_logs (id, user_id, action, target_type, target_id, ip_address)
             VALUES (?, ?, ?, ?, ?, ?)'
        )->execute([generateUuid(), $userId, $action, $type . '_record', $recordId, getClientIp()]);
    } catch (PDOException $e) {
        error_log('Typed registry audit error: ' . $e->getMessage());
    }
}

function handleTypedRegistry(string $method, string $type, ?string $id): void {
    $cfg = typedRegistryConfig($type);
    if (!$cfg) {
        jsonResponse(['success' => false, 'message' => 'Not found'], 404);
    }
    $user = authenticate();

    if ($id === 'bulk') {
        if ($method !== 'POST') jsonResponse(['success' => false, 'message' => 'Not found'], 404);
        requireRole($user, 'admin', 'superadmin');
        bulkTypedImport($cfg, $type, $user);
    }

    if ($id !== null) {
        requireRole($user, 'admin', 'superadmin');
        if ($method === 'PUT')    { updateTypedRecord($cfg, $type, $id, $user); return; }
        if ($method === 'DELETE') { deleteTypedRecord($cfg, $type, $id, $user); return; }
        jsonResponse(['success' => false, 'message' => 'Not found'], 404);
    }

    if ($method === 'GET')  { listTypedRecords($cfg, $type); return; }
    if ($method === 'POST') { requireRole($user, 'admin', 'superadmin'); createTypedRecord($cfg, $type, $user); return; }
    jsonResponse(['success' => false, 'message' => 'Not found'], 404);
}

function listTypedRecords(array $cfg, string $type): void {
    $search = trim($_GET['search'] ?? '');
    $year   = (int) ($_GET['year'] ?? 0);
    $page   = max(1, (int) ($_GET['page'] ?? 1));
    $limit  = min(50, max(1, (int) ($_GET['limit'] ?? 20)));
    $offset = ($page - 1) * $limit;

    try {
        $db     = getDB();
        $where  = 'WHERE parish_id = ?';
        $params = ['st-marys'];

        if ($search !== '') {
            $ors = [];
            foreach ($cfg['searchCols'] as $c) {
                $ors[]    = "$c LIKE ?";
                $params[] = "%$search%";
            }
            $where .= ' AND (' . implode(' OR ', $ors) . ')';
        }
        if ($year > 0) {
            $where    .= " AND YEAR({$cfg['dateCol']}) = ?";
            $params[]  = $year;
        }

        $countStmt = $db->prepare("SELECT COUNT(*) AS total FROM {$cfg['table']} $where");
        $countStmt->execute($params);
        $total = (int) $countStmt->fetch()['total'];

        $dataStmt = $db->prepare(
            "SELECT * FROM {$cfg['table']} $where ORDER BY {$cfg['dateCol']} DESC LIMIT ? OFFSET ?"
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
        error_log("List {$type} records error: " . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function createTypedRecord(array $cfg, string $type, array $user): void {
    $r = sanitizeTypedRecord($cfg, getJsonBody());
    if (isset($r['error'])) {
        jsonResponse(['success' => false, 'message' => $r['error']], 400);
    }
    $values = $r['values'];

    try {
        $db    = getDB();
        $check = $db->prepare("SELECT id FROM {$cfg['table']} WHERE record_number = ? LIMIT 1");
        $check->execute([$values['record_number']]);
        if ($check->fetch()) {
            jsonResponse(['success' => false, 'message' => 'Record number already exists'], 409);
        }

        $cols = array_keys($values);
        $ph   = implode(',', array_fill(0, count($cols), '?'));
        $id   = generateUuid();
        $db->prepare(
            "INSERT INTO {$cfg['table']} (" . implode(',', $cols) . ", id, parish_id, created_by)
             VALUES ($ph, ?, ?, ?)"
        )->execute([...array_values($values), $id, 'st-marys', $user['id']]);

        typedAudit($user['id'], "create_{$type}_record", $type, $id);
        jsonResponse(['success' => true, 'message' => 'Record created', 'data' => ['id' => $id]], 201);
    } catch (PDOException $e) {
        error_log("Create {$type} record error: " . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function updateTypedRecord(array $cfg, string $type, string $id, array $user): void {
    $r = sanitizeTypedRecord($cfg, getJsonBody());
    if (isset($r['error'])) {
        jsonResponse(['success' => false, 'message' => $r['error']], 400);
    }
    $values = $r['values'];

    try {
        $db    = getDB();
        $check = $db->prepare("SELECT id FROM {$cfg['table']} WHERE record_number = ? AND id <> ? LIMIT 1");
        $check->execute([$values['record_number'], $id]);
        if ($check->fetch()) {
            jsonResponse(['success' => false, 'message' => 'Record number already exists'], 409);
        }

        $sets = implode(', ', array_map(fn($c) => "$c = ?", array_keys($values)));
        $stmt = $db->prepare(
            "UPDATE {$cfg['table']} SET $sets, updated_at = NOW()
             WHERE id = ? AND parish_id = ?"
        );
        $stmt->execute([...array_values($values), $id, 'st-marys']);
        if ($stmt->rowCount() === 0) {
            jsonResponse(['success' => false, 'message' => 'Record not found'], 404);
        }

        typedAudit($user['id'], "update_{$type}_record", $type, $id);
        jsonResponse(['success' => true, 'message' => 'Record updated']);
    } catch (PDOException $e) {
        error_log("Update {$type} record error: " . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function deleteTypedRecord(array $cfg, string $type, string $id, array $user): void {
    try {
        $stmt = getDB()->prepare("DELETE FROM {$cfg['table']} WHERE id = ? AND parish_id = ?");
        $stmt->execute([$id, 'st-marys']);
        if ($stmt->rowCount() === 0) {
            jsonResponse(['success' => false, 'message' => 'Record not found'], 404);
        }
        typedAudit($user['id'], "delete_{$type}_record", $type, $id);
        jsonResponse(['success' => true, 'message' => 'Record deleted']);
    } catch (PDOException $e) {
        error_log("Delete {$type} record error: " . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function bulkTypedImport(array $cfg, string $type, array $user): void {
    $body  = getJsonBody();
    $items = $body['records'] ?? [];
    if (!is_array($items) || count($items) === 0) {
        jsonResponse(['success' => false, 'message' => 'No records provided'], 400);
    }
    if (count($items) > 5000) {
        jsonResponse(['success' => false, 'message' => 'Too many records (max 5000)'], 400);
    }

    $cols = array_map(fn($f) => $f['col'], $cfg['fields']);
    $ph   = implode(',', array_fill(0, count($cols), '?'));
    $sql  = "INSERT IGNORE INTO {$cfg['table']} (" . implode(',', $cols) . ", id, parish_id, created_by)
             VALUES ($ph, ?, ?, ?)";

    $imported = 0;
    $errors   = [];
    try {
        $db   = getDB();
        $stmt = $db->prepare($sql);
        foreach ($items as $i => $raw) {
            $rowLabel = $raw['row'] ?? $i + 2;
            $r = sanitizeTypedRecord($cfg, is_array($raw) ? $raw : []);
            if (isset($r['error'])) {
                $errors[] = ['row' => $rowLabel, 'message' => $r['error']];
                continue;
            }
            try {
                $stmt->execute([...array_values($r['values']), generateUuid(), 'st-marys', $user['id']]);
                $imported++;
            } catch (PDOException $e) {
                $errors[] = ['row' => $rowLabel, 'message' => $e->getMessage()];
            }
        }
    } catch (PDOException $e) {
        error_log("Bulk {$type} import error: " . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }

    if ($imported > 0) {
        typedAudit($user['id'], "import_{$type}_records", $type, (string) $imported);
    }
    jsonResponse([
        'success' => true,
        'data'    => ['imported' => $imported, 'failed' => count($errors), 'errors' => array_slice($errors, 0, 50)],
    ]);
}
