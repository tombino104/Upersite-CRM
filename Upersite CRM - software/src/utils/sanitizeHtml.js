import DOMPurify from 'dompurify';

// Configurazione per l'HTML delle note: mantiene formattazione, checkbox,
// link interni (data-path, contenteditable) e immagini base64, ma rimuove
// script, gestori di eventi (onerror, onclick...) e URL javascript:.
const NOTE_HTML_CONFIG = {
    ADD_ATTR: ['target', 'contenteditable'],
};

export function sanitizeHtml(html) {
    return DOMPurify.sanitize(html || '', NOTE_HTML_CONFIG);
}

// Ripulisce sul posto i figli di un elemento (es. l'editor dopo un incolla),
// senza ricreare il contenuto e quindi senza perdere la posizione del cursore.
export function sanitizeChildrenInPlace(root) {
    if (!root) return;
    Array.from(root.children).forEach(child => {
        try {
            DOMPurify.sanitize(child, { ...NOTE_HTML_CONFIG, IN_PLACE: true });
        } catch {
            // DOMPurify lancia un errore se l'elemento stesso è vietato (es. <script>)
            child.remove();
        }
    });
}
