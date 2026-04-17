<?php
declare(strict_types=1);

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/vendor/autoload.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception;

/**
 * Send an email using PHPMailer + SMTP.
 * @param string $to Recipient email
 * @param string $subject Email subject
 * @param string $body HTML body
 * @param string|null $toName Recipient name (optional)
 * @return bool True on success, false on failure
 */
function sendEmail(string $to, string $subject, string $body, ?string $toName = null): bool {
    if (!MAIL_HOST || !MAIL_USERNAME) {
        error_log('sendEmail: SMTP not configured');
        return false;
    }

    try {
        $mail = new PHPMailer(true);
        $mail->isSMTP();
        $mail->Host       = MAIL_HOST;
        $mail->SMTPAuth   = true;
        $mail->Username   = MAIL_USERNAME;
        $mail->Password   = MAIL_PASSWORD;
        $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
        $mail->Port       = MAIL_PORT;
        $mail->CharSet    = 'UTF-8';

        $mail->setFrom(MAIL_FROM_ADDRESS, MAIL_FROM_NAME);
        $mail->addAddress($to, $toName ?? '');
        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body    = $body;
        $mail->AltBody = strip_tags($body);

        $mail->send();
        return true;
    } catch (Exception $e) {
        error_log('sendEmail error: ' . $e->getMessage());
        return false;
    }
}
