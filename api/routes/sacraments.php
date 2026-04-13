<?php
declare(strict_types=1);

require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../middleware/auth.php';

/**
 * Connect to the SVF parish sacraments database (separate from main DB).
 */
function getSacramentsDB(): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;

    $pdo = new PDO(
        'mysql:host=localhost;port=3306;dbname=u222318185_svf_parish;charset=utf8mb4',
        'u222318185_svf_user',
        'kNooCkk@0228a1',
        [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]
    );
    return $pdo;
}

function handleSacraments(string $method, ?string $id, ?string $action): void {
    match (true) {
        $method === 'GET' && !$id       => searchSacraments(),
        $method === 'GET' && !!$id      => getSacrament($id),
        default => jsonResponse(['success' => false, 'message' => 'Not found'], 404),
    };
    exit;
}

function searchSacraments(): void {
    $user = authenticate();

    $search = trim($_GET['search'] ?? '');
    $birthday = trim($_GET['birthday'] ?? '');
    $page   = max(1, (int)($_GET['page'] ?? 1));
    $limit  = min(50, max(1, (int)($_GET['limit'] ?? 20)));
    $offset = ($page - 1) * $limit;

    // Non-superadmin users can only view their own record
    $isSuperAdmin = $user['role'] === 'superadmin';

    try {
        $db     = getSacramentsDB();
        $where  = 'WHERE 1=1';
        $params = [];

        if (!$isSuperAdmin) {
            // Get the user's name from the main DB to match against sacraments
            $mainDb = getDB();
            $nameStmt = $mainDb->prepare('SELECT name FROM users WHERE id = ? LIMIT 1');
            $nameStmt->execute([$user['id']]);
            $userRow = $nameStmt->fetch();
            $userName = $userRow['name'] ?? '';

            $where  .= ' AND LOWER(name) = LOWER(?)';
            $params[] = $userName;
        } else {
            // Superadmin can search all records
            if ($search) {
                $where  .= ' AND name LIKE ?';
                $params[] = '%' . $search . '%';
            }
            if ($birthday) {
                // Birthday is stored as text like "September 24, 1995"
                // Convert yyyy-MM-dd input to that format
                $ts = strtotime($birthday);
                if ($ts !== false) {
                    $birthdayISO          = date('Y-m-d', $ts);
                    $birthdayWithComma    = date('F j, Y', $ts);
                    $birthdayWithoutComma = date('F j Y', $ts);
                    $where  .= ' AND (birthday = ? OR birthday = ? OR birthday = ?)';
                    $params[] = $birthdayISO;
                    $params[] = $birthdayWithComma;
                    $params[] = $birthdayWithoutComma;
                }
            }
        }

        $countStmt = $db->prepare("SELECT COUNT(*) AS total FROM sacraments $where");
        $countStmt->execute($params);
        $total = (int)$countStmt->fetch()['total'];

        $dataStmt = $db->prepare(
            "SELECT id, name, birthday, parents_name, baptized_by, canonical_book,
                    baptismal_date, godparents_name, confirmed_by, confirmbook_no,
                    confirmed_date, confirm_sponsor
             FROM sacraments $where ORDER BY name ASC LIMIT ? OFFSET ?"
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
        error_log('Sacraments search error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}

function getSacrament(string $id): void {
    authenticate();

    try {
        $db   = getSacramentsDB();
        $stmt = $db->prepare('SELECT * FROM sacraments WHERE id = ? LIMIT 1');
        $stmt->execute([$id]);
        $record = $stmt->fetch();

        if (!$record) {
            jsonResponse(['success' => false, 'message' => 'Record not found'], 404);
        }

        jsonResponse(['success' => true, 'data' => $record]);
    } catch (PDOException $e) {
        error_log('Get sacrament error: ' . $e->getMessage());
        jsonResponse(['success' => false, 'message' => 'Internal server error'], 500);
    }
}
