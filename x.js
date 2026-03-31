add_action('wpcf7_mail_sent', 'avrupa_cf7_to_hubspot_global');

function avrupa_cf7_to_hubspot_global($contact_form) {
    $submission = WPCF7_Submission::get_instance();
    if (!$submission) {
        return;
    }

    $data = $submission->get_posted_data();
    if (empty($data) || !is_array($data)) {
        return;
    }

    
    $hubspot_token = 'Tok'; 

    $name  = avrupa_find_cf7_value($data, ['your-name', 'name', 'fullname', 'full-name', 'ad-soyad', 'adsoyad', 'text-947']);
    $phone = avrupa_find_cf7_value($data, ['your-phone', 'phone', 'telefon', 'tel', 'mobile', 'gsm', 'text-728']);
    $email = avrupa_find_cf7_value($data, ['your-email', 'email', 'eposta', 'mail']);
    $gclid = avrupa_find_cf7_value($data, ['gclid']);

    $firstname = '';
    $lastname  = '';

    if (!empty($name)) {
        $name_parts = preg_split('/\s+/', trim($name));
        $firstname = array_shift($name_parts);
        $lastname  = !empty($name_parts) ? implode(' ', $name_parts) : '';
    }

    if (!empty($phone)) {
        $phone = preg_replace('/[^\d\+]/', '', $phone);
    }

    $properties = [];

    if (!empty($email)) {
        $properties['email'] = sanitize_email($email);
    }

    if (!empty($firstname)) {
        $properties['firstname'] = sanitize_text_field($firstname);
    }

    if (!empty($lastname)) {
        $properties['lastname'] = sanitize_text_field($lastname);
    }

    if (!empty($phone)) {
        $properties['phone'] = sanitize_text_field($phone);
    }

    if (!empty($gclid)) {
        $properties['gclid'] = sanitize_text_field($gclid);
    }
    if (empty($properties)) {
        return;
    }

    $body = [
        'properties' => $properties
    ];

    $response = wp_remote_post('https://api.hubapi.com/crm/v3/objects/contacts', [
        'method'  => 'POST',
        'timeout' => 20,
        'headers' => [
            'Authorization' => 'Bearer ' . $hubspot_token,
            'Content-Type'  => 'application/json',
        ],
        'body' => wp_json_encode($body),
    ]);

    if (is_wp_error($response)) {
        error_log('HubSpot CF7 Error: ' . $response->get_error_message());
        return;
    }

    $status_code = wp_remote_retrieve_response_code($response);
    $response_body = wp_remote_retrieve_body($response);

    // (PATCH)
    if ($status_code == 409) {
        $response_data = json_decode($response_body, true);
        
        if (isset($response_data['message']) && preg_match('/Existing ID: (\d+)/', $response_data['message'], $matches)) {
            $existing_contact_id = $matches[1];
            
            $update_response = wp_remote_request('https://api.hubapi.com/crm/v3/objects/contacts/' . $existing_contact_id, [
                'method'  => 'PATCH',
                'timeout' => 20,
                'headers' => [
                    'Authorization' => 'Bearer ' . $hubspot_token,
                    'Content-Type'  => 'application/json',
                ],
                'body' => wp_json_encode($body),
            ]);
            
            $update_status = wp_remote_retrieve_response_code($update_response);
            if ($update_status < 200 || $update_status >= 300) {
                 error_log('HubSpot CF7 Update Error [' . $update_status . ']: ' . wp_remote_retrieve_body($update_response));
            }
        }
    } elseif ($status_code < 200 || $status_code >= 300) {
        error_log('HubSpot CF7 API Error [' . $status_code . ']: ' . $response_body);
    }
}

function avrupa_find_cf7_value($data, $possible_keys = []) {
    foreach ($possible_keys as $key) {
        if (isset($data[$key]) && !empty($data[$key])) {
            if (is_array($data[$key])) {
                return implode(', ', array_map('sanitize_text_field', $data[$key]));
            }
            return trim(wp_strip_all_tags($data[$key]));
        }
    }
    return '';
}
