// Zeitstempel des Builds – hängt an CSS/JS, damit Browser nach jedem Update
// sofort die neue Version laden statt einer zwischengespeicherten alten.
export default { version: Date.now().toString(36) };
