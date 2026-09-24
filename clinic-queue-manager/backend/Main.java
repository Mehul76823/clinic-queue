import com.sun.net.httpserver.*;
import java.io.*;
import java.net.InetSocketAddress;
import java.nio.file.*;
import java.time.*;
import java.util.*;
import java.util.stream.*;

/** Clinic Appointment & Queue Manager - dependency-free Java backend (JDK 17+). */
public class Main {
  static final Path WEB = Paths.get(System.getProperty("web", "frontend")).toAbsolutePath().normalize();
  static final List<Map<String, Object>> DOCTORS = List.of(
      doc(1, "Dr. Ananya Rao", "General Physician", 12, "MBBS, MD (Medicine)", 500, "Fever, infections, diabetes and everyday family health."),
      doc(2, "Dr. Vikram Mehta", "Cardiologist", 15, "MBBS, DM (Cardiology)", 900, "Blood pressure, heart rhythm, chest pain and preventive cardiac care."),
      doc(3, "Dr. Sana Khan", "Pediatrician", 9, "MBBS, MD (Pediatrics)", 600, "Newborn care, vaccinations, growth and childhood illness."),
      doc(4, "Dr. Rohit Verma", "Dermatologist", 8, "MBBS, MD (Dermatology)", 700, "Acne, allergies, hair and skin conditions."));

  static final Map<String, String> NEXT = Map.of("SCHEDULED", "WAITING", "WAITING", "IN_CONSULT", "IN_CONSULT", "COMPLETED");
  static final int SLOT = 20;
  static final List<Map<String, Object>> A = new ArrayList<>();
  static int seq = 1000;
  static final Path DB = Paths.get(System.getProperty("db", "data/clinic.json"));
  static final Map<String, String> USERS = new HashMap<>(), SESS = new HashMap<>();
  static final Map<String, Long> EXP = new HashMap<>();

  static String hash(String u, String p) {
    try { return HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest((u + ":carepoint:" + p).getBytes("UTF-8"))); }
    catch (Exception e) { throw new RuntimeException(e); }
  }
  static String user(HttpExchange x) {
    String h = x.getRequestHeaders().getFirst("Authorization");
    if (h == null || !h.startsWith("Bearer ")) return null;
    String t = h.substring(7); Long e = EXP.get(t);
    if (e == null || e < System.currentTimeMillis()) { SESS.remove(t); EXP.remove(t); return null; }
    return SESS.get(t);
  }
  /** File-backed persistence: every change is written atomically to data/clinic.json. */
  @SuppressWarnings("unchecked")
  static boolean load() {
    try {
      if (!Files.exists(DB)) return false;
      Map<String, Object> m = (Map<String, Object>) Json.r(Files.readString(DB));
      seq = ((Number) m.get("seq")).intValue();
      for (Object o : (List<?>) m.get("appts")) { Map<String, Object> a = (Map<String, Object>) o; a.put("doctorId", ((Number) a.get("doctorId")).intValue()); A.add(a); }
      return true;
    } catch (Exception e) { System.out.println("Could not read database: " + e); A.clear(); return false; }
  }
  static void save() {
    try {
      Files.createDirectories(DB.toAbsolutePath().getParent());
      Path t = DB.toAbsolutePath().resolveSibling("clinic.tmp");
      Files.writeString(t, Json.w(Map.of("seq", seq, "appts", A)));
      Files.move(t, DB.toAbsolutePath(), StandardCopyOption.REPLACE_EXISTING);
    } catch (IOException e) { System.out.println("Could not save database: " + e); }
  }

  static Map<String, Object> doc(int id, String n, String sp, int exp, String q, int fee, String about) {
    return new LinkedHashMap<>(Map.of("id", id, "name", n, "specialty", sp, "experience", exp, "qualification", q, "fee", fee, "about", about));
  }
  static class Err extends RuntimeException { final int c; Err(int c, String m) { super(m); this.c = c; } }

  public static void main(String[] args) throws Exception {
    String su = System.getenv().getOrDefault("STAFF_USER", "admin"), sp = System.getenv().getOrDefault("STAFF_PASS", "clinic123");
    USERS.put(su, hash(su, sp)); USERS.put("reception", hash("reception", "reception123"));
    if (!load()) { demo(); save(); }
    HttpServer s = HttpServer.create(new InetSocketAddress(8080), 0);
    s.createContext("/", Main::handle);
    s.start();
    System.out.println("Clinic Queue Manager running at http://localhost:8080");
  }

  static void demo() {
    String d = LocalDate.now().toString();
    seed(1, d, "09:00", "Rahul Nair", "COMPLETED", "Viral fever. Paracetamol 500mg twice daily for 3 days. Rest and fluids.");
    seed(1, d, "09:20", "Priya Singh", "IN_CONSULT", ""); seed(1, d, "09:40", "Amit Joshi", "WAITING", "");
    seed(1, d, "10:00", "Neha Gupta", "SCHEDULED", ""); seed(2, d, "09:00", "Suresh Iyer", "COMPLETED", "BP stable. Continue Amlodipine 5mg. Review in 4 weeks.");
    seed(2, d, "09:20", "Kavita Rao", "WAITING", ""); seed(2, d, "10:20", "Manoj Das", "SCHEDULED", ""); seed(3, d, "09:40", "Baby Aarav (Parent: Sneha)", "SCHEDULED", "");
  }

  static void seed(int doc, String date, String time, String name, String st, String notes) {
    Map<String, Object> a = new LinkedHashMap<>();
    a.put("id", "A" + (++seq)); a.put("doctorId", doc); a.put("patient", name); a.put("phone", "9876543210");
    a.put("reason", "General consultation"); a.put("date", date); a.put("time", time); a.put("status", st); a.put("notes", notes);
    A.add(a);
  }

  static void handle(HttpExchange x) throws IOException {
    String p = x.getRequestURI().getPath();
    try {
      if (p.startsWith("/api/")) {
        Object r;
        synchronized (A) { r = api(x.getRequestMethod(), p.substring(5).split("/"), query(x), body(x), user(x));
          if (!x.getRequestMethod().equals("GET")) save(); }
        send(x, 200, "application/json", Json.w(r).getBytes("UTF-8"));
      } else file(x, p);
    } catch (Err e) { send(x, e.c, "application/json", Json.w(Map.of("error", e.getMessage())).getBytes("UTF-8")); }
    catch (Exception e) { send(x, 400, "application/json", Json.w(Map.of("error", "Bad request")).getBytes("UTF-8")); }
  }

  static Object api(String m, String[] s, Map<String, String> q, Map<String, Object> b, String user) {
    String today = LocalDate.now().toString();
    switch (s[0]) {
      case "login": {
        String u = str(b, "username"), h = USERS.get(u);
        if (h == null || !h.equals(hash(u, str(b, "password")))) throw new Err(401, "Incorrect username or password");
        byte[] r = new byte[24]; new java.security.SecureRandom().nextBytes(r);
        String t = HexFormat.of().formatHex(r); SESS.put(t, u); EXP.put(t, System.currentTimeMillis() + 8 * 3600_000L);
        return Map.of("token", t, "username", u);
      }
      case "doctors":
        if (s.length == 1) return DOCTORS;
        return slots(Integer.parseInt(s[1]), q.getOrDefault("date", today));
      case "queue":
        if (user == null) throw new Err(401, "Staff login required");
        return A.stream().filter(a -> a.get("date").equals(q.getOrDefault("date", today)))
            .filter(a -> !q.containsKey("doctorId") || a.get("doctorId").toString().equals(q.get("doctorId")))
            .sorted(Comparator.comparing((Map<String, Object> a) -> (String) a.get("time")))
            .map(Main::view).collect(Collectors.toList());
      case "appointments":
        if (m.equals("POST") && s.length == 1) return book(b);
        Map<String, Object> ap = A.stream().filter(a -> a.get("id").toString().equalsIgnoreCase(s[1])).findFirst()
            .orElseThrow(() -> new Err(404, "Appointment not found"));
        if (s.length == 2) return view(ap);
        if (user == null) throw new Err(401, "Staff login required");
        String cur = (String) ap.get("status");
        switch (s[2]) {
          case "status": {
            String to = str(b, "status");
            if (!to.equals(NEXT.get(cur))) throw new Err(409, "Invalid transition " + cur + " to " + to + ". Next allowed: " + NEXT.getOrDefault(cur, "none"));
            if (to.equals("IN_CONSULT") && A.stream().anyMatch(o -> o != ap && o.get("doctorId").equals(ap.get("doctorId"))
                && o.get("date").equals(ap.get("date")) && o.get("status").equals("IN_CONSULT")))
              throw new Err(409, "Doctor is already consulting another patient");
            ap.put("status", to);
            if (to.equals("COMPLETED")) ap.put("notes", str(b, "notes"));
            return view(ap);
          }
          case "notes":
            if (!cur.equals("COMPLETED")) throw new Err(409, "Notes can only be added to completed appointments");
            ap.put("notes", str(b, "notes")); return view(ap);
          case "cancel":
            if (!cur.equals("SCHEDULED") && !cur.equals("WAITING")) throw new Err(409, "Cannot cancel an appointment that is " + cur);
            ap.put("status", "CANCELLED"); return view(ap);
          case "reschedule": {
            if (!cur.equals("SCHEDULED")) throw new Err(409, "Only scheduled appointments can be rescheduled");
            String date = str(b, "date"), time = str(b, "time");
            check((int) ap.get("doctorId"), date, time, ap);
            ap.put("date", date); ap.put("time", time); return view(ap);
          }
        }
    }
    throw new Err(404, "Not found");
  }

  static List<String> slotList() {
    List<String> l = new ArrayList<>();
    for (int m = 9 * 60; m < 17 * 60; m += SLOT) if (m < 13 * 60 || m >= 14 * 60) l.add(String.format("%02d:%02d", m / 60, m % 60));
    return l;
  }
  static boolean taken(int d, String date, String time, Map<String, Object> self) {
    return A.stream().anyMatch(a -> a != self && !a.get("status").equals("CANCELLED") && a.get("doctorId").equals(d)
        && a.get("date").equals(date) && a.get("time").equals(time));
  }
  static void check(int d, String date, String time, Map<String, Object> self) {
    if (!slotList().contains(time)) throw new Err(400, "Invalid time slot");
    if (LocalDate.parse(date).isBefore(LocalDate.now())) throw new Err(400, "Date is in the past");
    if (taken(d, date, time, self)) throw new Err(409, "That slot is already booked. Pick another time.");
  }
  static Object slots(int d, String date) {
    return slotList().stream().map(t -> Map.of("time", t, "available", !taken(d, date, t, null))).collect(Collectors.toList());
  }

  static Object book(Map<String, Object> b) {
    String name = str(b, "patient"), phone = str(b, "phone"), date = str(b, "date"), time = str(b, "time");
    int d = ((Number) b.get("doctorId")).intValue();
    if (name.length() < 2 || !phone.matches("\\d{10}")) throw new Err(400, "Enter the patient name and a 10-digit phone number");
    check(d, date, time, null);
    Map<String, Object> a = new LinkedHashMap<>();
    a.put("id", "A" + (++seq)); a.put("doctorId", d); a.put("patient", name); a.put("phone", phone);
    a.put("reason", str(b, "reason")); a.put("date", date); a.put("time", time); a.put("status", "SCHEDULED"); a.put("notes", "");
    A.add(a);
    return view(a);
  }

  /** Queue position and estimated wait: patients ahead (waiting / in consult, earlier slot) x slot length. */
  static Map<String, Object> view(Map<String, Object> a) {
    Map<String, Object> v = new LinkedHashMap<>(a);
    v.put("doctorName", DOCTORS.stream().filter(d -> d.get("id").equals(a.get("doctorId"))).findFirst().get().get("name"));
    String st = (String) a.get("status");
    if (st.equals("SCHEDULED") || st.equals("WAITING")) {
      long ahead = A.stream().filter(o -> o != a && o.get("doctorId").equals(a.get("doctorId")) && o.get("date").equals(a.get("date"))
          && (o.get("status").equals("WAITING") || o.get("status").equals("IN_CONSULT"))
          && ((String) o.get("time")).compareTo((String) a.get("time")) < 0).count();
      v.put("position", ahead + 1); v.put("waitMins", ahead * SLOT);
    }
    return v;
  }

  static String str(Map<String, Object> b, String k) { return Objects.toString(b.get(k), "").trim(); }
  static Map<String, String> query(HttpExchange x) {
    Map<String, String> m = new HashMap<>(); String q = x.getRequestURI().getQuery();
    if (q != null) for (String kv : q.split("&")) { String[] p = kv.split("=", 2); if (p.length == 2) m.put(p[0], p[1]); }
    return m;
  }
  @SuppressWarnings("unchecked")
  static Map<String, Object> body(HttpExchange x) throws IOException {
    String t = new String(x.getRequestBody().readAllBytes(), "UTF-8");
    return t.isBlank() ? new HashMap<>() : (Map<String, Object>) Json.r(t);
  }
  static void send(HttpExchange x, int code, String type, byte[] d) throws IOException {
    x.getResponseHeaders().add("Content-Type", type + "; charset=utf-8"); x.getResponseHeaders().add("Cache-Control", "no-store");
    x.sendResponseHeaders(code, d.length); try (OutputStream o = x.getResponseBody()) { o.write(d); }
  }
  static void file(HttpExchange x, String p) throws IOException {
    Path f = WEB.resolve(p.equals("/") ? "index.html" : p.substring(1)).normalize();
    if (!f.startsWith(WEB) || !Files.isRegularFile(f)) { send(x, 404, "text/plain", "Not found".getBytes()); return; }
    String n = f.toString(), t = n.endsWith(".html") ? "text/html" : n.endsWith(".css") ? "text/css" : n.endsWith(".jsx") || n.endsWith(".js") ? "text/javascript" : "application/octet-stream";
    send(x, 200, t, Files.readAllBytes(f));
  }

  /** Minimal JSON reader/writer so the backend needs no external libraries. */
  static class Json {
    static String w(Object o) {
      if (o == null) return "null";
      if (o instanceof Map<?, ?> m) return m.entrySet().stream().map(e -> w(String.valueOf(e.getKey())) + ":" + w(e.getValue())).collect(Collectors.joining(",", "{", "}"));
      if (o instanceof Collection<?> c) return c.stream().map(Json::w).collect(Collectors.joining(",", "[", "]"));
      if (o instanceof String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char ch : s.toCharArray()) switch (ch) {
          case '"' -> b.append("\\\""); case '\\' -> b.append("\\\\"); case '\n' -> b.append("\\n"); case '\t' -> b.append("\\t");
          case '\r' -> { } default -> b.append(ch);
        }
        return b.append('"').toString();
      }
      return o.toString();
    }
    static int i; static String t;
    static synchronized Object r(String s) { t = s; i = 0; return v(); }
    static void ws() { while (i < t.length() && Character.isWhitespace(t.charAt(i))) i++; }
    static Object v() {
      ws(); char c = t.charAt(i);
      if (c == '{') {
        i++; Map<String, Object> m = new LinkedHashMap<>(); ws(); if (t.charAt(i) == '}') { i++; return m; }
        while (true) { ws(); String k = (String) v(); ws(); i++; m.put(k, v()); ws(); if (t.charAt(i++) == '}') return m; }
      }
      if (c == '[') {
        i++; List<Object> l = new ArrayList<>(); ws(); if (t.charAt(i) == ']') { i++; return l; }
        while (true) { l.add(v()); ws(); if (t.charAt(i++) == ']') return l; }
      }
      if (c == '"') {
        i++; StringBuilder b = new StringBuilder();
        while (t.charAt(i) != '"') {
          char ch = t.charAt(i++);
          if (ch == '\\') { char e = t.charAt(i++); switch (e) { case 'n' -> b.append('\n'); case 't' -> b.append('\t');
            case 'u' -> { b.append((char) Integer.parseInt(t.substring(i, i + 4), 16)); i += 4; } default -> b.append(e); } }
          else b.append(ch);
        }
        i++; return b.toString();
      }
      int st = i; while (i < t.length() && ",}] \n\r\t".indexOf(t.charAt(i)) < 0) i++;
      String x = t.substring(st, i);
      return x.equals("true") ? (Object) true : x.equals("false") ? (Object) false : x.equals("null") ? null : (Object) Double.parseDouble(x);
    }
  }
}
