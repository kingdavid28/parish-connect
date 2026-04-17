<?php
declare(strict_types=1);

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../middleware/auth.php';

// ─── Router ───────────────────────────────────────────────────────────────────

function handleCommunity(string $method, ?string $resource, ?string $id, ?string $action): void {
    match (true) {
        // ── Family groups ──────────────────────────────────────────────────────
        $resource === 'families' && $method === 'GET'  && !$id                          => listFamilyGroups(),
        $resource === 'families' && $method === 'POST' && !$id                          => createFamilyGroup(),
        $resource === 'families' && $method === 'GET'  && !!$id && !$action             => getFamilyGroup($id),
        $resource === 'families' && $method === 'PUT'  && !!$id && !$action             => updateFamilyGroup($id),
        $resource === 'families' && $method === 'DELETE' && !!$id && !$action           => deleteFamilyGroup($id),
        $resource === 'families' && $method === 'POST' && !!$id && $action === 'members' => addFamilyMember($id),
        $resource === 'families' && $method === 'DELETE' && !!$id && $action === 'members' => removeFamilyMember($id),

        // ── Ministries ─────────────────────────────────────────────────────────
        $resource === 'ministries' && $method === 'GET'  && !$id                           => listMinistries(),
        $resource === 'ministries' && $method === 'POST' && !$id                           => createMinistry(),
        $resource === 'ministries' && $method === 'GET'  && !!$id && !$action              => getMinistry($id),
        $resource === 'ministries' && $method === 'PUT'  && !!$id && !$action              => updateMinistry($id),
        $resource === 'ministries' && $method === 'DELETE' && !!$id && !$action            => deleteMinistry($id),
        $resource === 'ministries' && $method === 'POST' && !!$id && $action === 'join'    => joinMinistry($id),
        $resource === 'ministries' && $method === 'DELETE' && !!$id && $action === 'leave' => leaveMinistry($id),
        $resource === 'ministries' && $method === 'GET'  && !!$id && $action === 'members' => getMinistryMembers($id),

        default => jsonResponse(['success' => false, 'message' => 'Not found'], 404),
    };
    exit;
}

// ═════════════════════════════════════════════════════════════════════════════
// FAMILY GROUPS
// ═════════════════════════════════════════════════════════════════════════════

function listFamilyGroups(): void {
    $user = authenticate();
    $db   = getDB();

    try {
        $stmt = $db->prepare(
            "SELECT fg.id, fg.name, fg.description, fg.created_by, fg.created_at,
                    u.name AS created_by_name,
                    COUNT(fgm.user_id) AS member_count,
                    MAX(CASE WHEN fgm.user_id = ? THEN 1 ELSE 0 END) AS is_member
             FROM family_groups fg
             JOIN users u ON u.id = fg.created_by
             LEFT JOIN family_group_members fgm ON fgm.group_id = fg.id
             GROUP BY fg.id
             ORDER BY fg.name ASC"
        );
        $stmt->execute([$user['id']]);
        jsonResponse(['success' => true, 'data' => $stmt->fetchAll()]);
    } catch (PDOException $e) {
        error_log('listFamilyGroups error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function createFamilyGroup(): void {
    $user = authenticate();
    requireRole($user, 'admin', 'superadmin');

    $body = getJsonBody();
    $name = trim($body['name'] ?? '');
    $desc = mb_substr(trim($body['description'] ?? ''), 0, 500);

    if (!$name) {
        jsonResponse(['success' => false, 'message' => 'Group name is required'], 400);
    }

    try {
        $db = getDB();
        $id = generateUuid();
        $db->prepare(
            'INSERT INTO family_groups (id, name, description, created_by) VALUES (?, ?, ?, ?)'
        )->execute([$id, $name, $desc ?: null, $user['id']]);

        jsonResponse(['success' => true, 'message' => 'Family group created', 'data' => ['id' => $id]], 201);
    } catch (PDOException $e) {
        error_log('createFamilyGroup error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function getFamilyGroup(string $id): void {
    authenticate();
    $db = getDB();

    try {
        $group = $db->prepare(
            'SELECT fg.*, u.name AS created_by_name FROM family_groups fg
             JOIN users u ON u.id = fg.created_by WHERE fg.id = ? LIMIT 1'
        );
        $group->execute([$id]);
        $data = $group->fetch();
        if (!$data) jsonResponse(['success' => false, 'message' => 'Group not found'], 404);

        $members = $db->prepare(
            'SELECT u.id, u.name, u.avatar, u.role, fgm.relationship, fgm.joined_at
             FROM family_group_members fgm
             JOIN users u ON u.id = fgm.user_id AND u.is_active = 1
             WHERE fgm.group_id = ?
             ORDER BY fgm.joined_at ASC'
        );
        $members->execute([$id]);
        $data['members'] = $members->fetchAll();

        jsonResponse(['success' => true, 'data' => $data]);
    } catch (PDOException $e) {
        error_log('getFamilyGroup error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function updateFamilyGroup(string $id): void {
    $user = authenticate();
    requireRole($user, 'admin', 'superadmin');

    $body = getJsonBody();
    $name = trim($body['name'] ?? '');
    $desc = mb_substr(trim($body['description'] ?? ''), 0, 500);

    if (!$name) {
        jsonResponse(['success' => false, 'message' => 'Group name is required'], 400);
    }

    try {
        $db = getDB();
        $db->prepare(
            'UPDATE family_groups SET name = ?, description = ? WHERE id = ?'
        )->execute([$name, $desc ?: null, $id]);

        jsonResponse(['success' => true, 'message' => 'Family group updated']);
    } catch (PDOException $e) {
        error_log('updateFamilyGroup error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function deleteFamilyGroup(string $id): void {
    $user = authenticate();
    requireRole($user, 'admin', 'superadmin');

    try {
        $db = getDB();
        $db->prepare('DELETE FROM family_groups WHERE id = ?')->execute([$id]);
        jsonResponse(['success' => true, 'message' => 'Family group deleted']);
    } catch (PDOException $e) {
        error_log('deleteFamilyGroup error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function addFamilyMember(string $groupId): void {
    $user = authenticate();
    requireRole($user, 'admin', 'superadmin');

    $body         = getJsonBody();
    $memberId     = trim($body['user_id']      ?? '');
    $relationship = trim($body['relationship'] ?? '');

    if (!$memberId) {
        jsonResponse(['success' => false, 'message' => 'user_id is required'], 400);
    }

    $validRelationships = ['parent', 'child', 'spouse', 'sibling', 'grandparent', 'grandchild', 'relative', 'other'];
    if ($relationship && !in_array($relationship, $validRelationships, true)) {
        jsonResponse(['success' => false, 'message' => 'Invalid relationship'], 400);
    }

    try {
        $db = getDB();
        $db->prepare(
            'INSERT IGNORE INTO family_group_members (group_id, user_id, relationship) VALUES (?, ?, ?)'
        )->execute([$groupId, $memberId, $relationship ?: 'other']);

        jsonResponse(['success' => true, 'message' => 'Member added to family group']);
    } catch (PDOException $e) {
        error_log('addFamilyMember error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function removeFamilyMember(string $groupId): void {
    $user = authenticate();
    requireRole($user, 'admin', 'superadmin');

    $body     = getJsonBody();
    $memberId = trim($body['user_id'] ?? '');

    if (!$memberId) {
        jsonResponse(['success' => false, 'message' => 'user_id is required'], 400);
    }

    try {
        $db = getDB();
        $db->prepare(
            'DELETE FROM family_group_members WHERE group_id = ? AND user_id = ?'
        )->execute([$groupId, $memberId]);

        jsonResponse(['success' => true, 'message' => 'Member removed from family group']);
    } catch (PDOException $e) {
        error_log('removeFamilyMember error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

// ═════════════════════════════════════════════════════════════════════════════
// MINISTRIES
// ═════════════════════════════════════════════════════════════════════════════

function listMinistries(): void {
    $user = authenticate();
    $db   = getDB();

    try {
        $stmt = $db->prepare(
            "SELECT m.id, m.name, m.description, m.schedule, m.contact_name, m.contact_email,
                    m.created_by, m.created_at,
                    COUNT(mm.user_id) AS member_count,
                    MAX(CASE WHEN mm.user_id = ? THEN 1 ELSE 0 END) AS is_member
             FROM ministries m
             LEFT JOIN ministry_members mm ON mm.ministry_id = m.id
             GROUP BY m.id
             ORDER BY m.name ASC"
        );
        $stmt->execute([$user['id']]);
        jsonResponse(['success' => true, 'data' => $stmt->fetchAll()]);
    } catch (PDOException $e) {
        error_log('listMinistries error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function createMinistry(): void {
    $user = authenticate();
    requireRole($user, 'admin', 'superadmin');

    $body         = getJsonBody();
    $name         = trim($body['name']          ?? '');
    $desc         = mb_substr(trim($body['description']   ?? ''), 0, 1000);
    $schedule     = mb_substr(trim($body['schedule']      ?? ''), 0, 255);
    $contactName  = mb_substr(trim($body['contact_name']  ?? ''), 0, 100);
    $contactEmail = trim($body['contact_email'] ?? '');

    if (!$name) {
        jsonResponse(['success' => false, 'message' => 'Ministry name is required'], 400);
    }
    if ($contactEmail && !filter_var($contactEmail, FILTER_VALIDATE_EMAIL)) {
        jsonResponse(['success' => false, 'message' => 'Invalid contact email'], 400);
    }

    try {
        $db = getDB();
        $id = generateUuid();
        $db->prepare(
            'INSERT INTO ministries (id, name, description, schedule, contact_name, contact_email, created_by)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        )->execute([$id, $name, $desc ?: null, $schedule ?: null, $contactName ?: null, $contactEmail ?: null, $user['id']]);

        jsonResponse(['success' => true, 'message' => 'Ministry created', 'data' => ['id' => $id]], 201);
    } catch (PDOException $e) {
        error_log('createMinistry error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function getMinistry(string $id): void {
    authenticate();
    $db = getDB();

    try {
        $stmt = $db->prepare('SELECT * FROM ministries WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $data = $stmt->fetch();
        if (!$data) jsonResponse(['success' => false, 'message' => 'Ministry not found'], 404);

        jsonResponse(['success' => true, 'data' => $data]);
    } catch (PDOException $e) {
        error_log('getMinistry error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function updateMinistry(string $id): void {
    $user = authenticate();
    requireRole($user, 'admin', 'superadmin');

    $body         = getJsonBody();
    $name         = trim($body['name']          ?? '');
    $desc         = mb_substr(trim($body['description']   ?? ''), 0, 1000);
    $schedule     = mb_substr(trim($body['schedule']      ?? ''), 0, 255);
    $contactName  = mb_substr(trim($body['contact_name']  ?? ''), 0, 100);
    $contactEmail = trim($body['contact_email'] ?? '');

    if (!$name) {
        jsonResponse(['success' => false, 'message' => 'Ministry name is required'], 400);
    }
    if ($contactEmail && !filter_var($contactEmail, FILTER_VALIDATE_EMAIL)) {
        jsonResponse(['success' => false, 'message' => 'Invalid contact email'], 400);
    }

    try {
        $db = getDB();
        $db->prepare(
            'UPDATE ministries SET name=?, description=?, schedule=?, contact_name=?, contact_email=? WHERE id=?'
        )->execute([$name, $desc ?: null, $schedule ?: null, $contactName ?: null, $contactEmail ?: null, $id]);

        jsonResponse(['success' => true, 'message' => 'Ministry updated']);
    } catch (PDOException $e) {
        error_log('updateMinistry error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function deleteMinistry(string $id): void {
    $user = authenticate();
    requireRole($user, 'admin', 'superadmin');

    try {
        $db = getDB();
        $db->prepare('DELETE FROM ministries WHERE id = ?')->execute([$id]);
        jsonResponse(['success' => true, 'message' => 'Ministry deleted']);
    } catch (PDOException $e) {
        error_log('deleteMinistry error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function joinMinistry(string $ministryId): void {
    $user = authenticate();

    try {
        $db = getDB();

        // Verify ministry exists
        $check = $db->prepare('SELECT id FROM ministries WHERE id = ? LIMIT 1');
        $check->execute([$ministryId]);
        if (!$check->fetch()) {
            jsonResponse(['success' => false, 'message' => 'Ministry not found'], 404);
        }

        $db->prepare(
            'INSERT IGNORE INTO ministry_members (ministry_id, user_id) VALUES (?, ?)'
        )->execute([$ministryId, $user['id']]);

        jsonResponse(['success' => true, 'message' => 'Joined ministry']);
    } catch (PDOException $e) {
        error_log('joinMinistry error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function leaveMinistry(string $ministryId): void {
    $user = authenticate();

    try {
        $db = getDB();
        $db->prepare(
            'DELETE FROM ministry_members WHERE ministry_id = ? AND user_id = ?'
        )->execute([$ministryId, $user['id']]);

        jsonResponse(['success' => true, 'message' => 'Left ministry']);
    } catch (PDOException $e) {
        error_log('leaveMinistry error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function getMinistryMembers(string $ministryId): void {
    authenticate();

    try {
        $db   = getDB();
        $stmt = $db->prepare(
            'SELECT u.id, u.name, u.avatar, u.role, mm.joined_at
             FROM ministry_members mm
             JOIN users u ON u.id = mm.user_id AND u.is_active = 1
             WHERE mm.ministry_id = ?
             ORDER BY mm.joined_at ASC'
        );
        $stmt->execute([$ministryId]);
        jsonResponse(['success' => true, 'data' => $stmt->fetchAll()]);
    } catch (PDOException $e) {
        error_log('getMinistryMembers error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}
