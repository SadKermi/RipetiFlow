# Trascrizione dei vocali del vecchio sviluppatore

> Fonte: `WhatsApp Ptt 2026-10-02 at 07.34–07.52` (10 note vocali, ~11 minuti in totale).
> Trascritti automaticamente con Whisper `large-v3-turbo` (lingua: italiano) e rivisti a mano solo per
> punteggiatura ed errori evidenti di riconoscimento. Le parti tra `[...]` sono note di revisione.
> La trascrizione grezza, non modificata, è in [`raw-transcript.md`](raw-transcript.md).

---

### 1 · 07.34.34 (19 s)
Intanto magari, prima battuta, poi ci sono domande se c'è qualche questione su cui vuoi portare
l'attenzione e l'analizziamo in dettaglio.

### 2 · 07.36.47 (125 s)
Allora, l'idea è questa. Io, così come Simone, che [fa] altre ripetizioni, siamo i target per questo
software: abbiamo la necessità di tenere traccia dei dati delle lezioni che facciamo. Ogni lezione è
singola, [ma] non c'è un solo [lezione per] studente: possiamo fare tante lezioni con ogni studente.
Dobbiamo tenere traccia sostanzialmente dei dati degli studenti, quindi una **sezione anagrafica**;
dobbiamo tenere traccia della **lezione**, nel senso che ci serve sapere **quando** è stata fatta,
**con chi** è stata fatta, **per quanto tempo**. E poi dobbiamo tenere traccia dei **pagamenti**, quindi
della ricezione di tot euro, fatta o come **bonifico** o come **contanti** — ci metti la scelta.
La ricezione è soltanto una cosa **compilativa**: non devi collegarlo con motori di pagamento esterni
(Satispay, PayPal…). Semplicemente, quando la persona X mi paga, apriamo il gestionale e diciamo:
"ok, ho preso X euro dalla persona X in questo giorno".

### 3 · 07.37.25 (27 s)
Quindi è paragonabile a un **libro mastro**: uno storico di tutto quello che è stato fatto, una
**cronologia degli snapshot** di tutto quello che è stato fatto per quanto riguarda le lezioni e i
pagamenti.

### 4 · 07.38.31 (60 s)
Ogni volta che si apre l'applicazione è fondamentale avere sotto mano le **prossime lezioni** da
svolgere, e poi la **situazione contabile** dei ragazzi, specialmente per quanto riguarda **debiti e
crediti**. Debiti e crediti li puoi vedere dalla mia prospettiva o da quella dello studente: sono uno
opposto all'altro. Per il momento, quando segno che uno studente ha un **debito**, lo studente ha un
debito verso di me: ha fatto delle ore che mi deve pagare. Se invece uno studente è in **credito**,
significa che mi ha anticipato dei soldi e quindi ha un **credito di ore**.

### 5 · 07.40.57 (42 s)
In una primissima versione avevo fatto anche una pagina con tutte le lezioni e una pagina con tutti i
pagamenti, che però poi sono state **abolite**. […] Le ho tolte perché abbiamo valutato con Simone che
non servono: è più semplice fare un click in più per **selezionare a monte lo studente**.

### 6 · 07.42.28 (71 s)
Poi, le lezioni. Ogni lezione si svolge **nello stesso giorno**, da un **orario di partenza** a un
**orario di fine**. Di ogni lezione bisogna tenere lo **studente** e poi una **materia** — la materia
scolastica: italiano, inglese, storia, informatica e così via — disponibile tramite un **menu a
tendina**. Nella versione che ho dato c'è anche una textarea, **note**, in cui io di solito inserisco
l'**argomento**. Ho valutato se lasciarlo sotto forma di note, se rinominarlo argomento, o se avere due
textarea. Non lo so, poi lo consideri tu.

### 7 · 07.47.40 (65 s)
Considera che per **entrare con Google** hai bisogno di una **procedura di verifica da parte di Google**
dell'applicativo, che io non ho ancora fatto, per poter essere accessibile liberamente. […] Antigravity,
l'agente di Google, ha una serie di integrazioni con le API di Google [che potrebbero aiutare]; quando
l'ho fatto io non c'era, ho dovuto leggere i documenti.

### 8 · 07.49.23 (91 s)
Avrai notato probabilmente che **non c'è una homepage**, quindi da considerare il fare anche quello.
Oltre all'integrazione con il login, Google è necessario anche per la **sincronizzazione con il
calendario**. L'idea è che tutte le volte che crei una nuova lezione, la lezione viene creata
all'interno del gestionale e poi si riporta un **evento su Google Calendar** dell'account con cui hai
fatto il login. Se sposti o cancelli una lezione **su Google Calendar** questo **non influenza** il
gestionale. Quindi da capire se riesci a renderlo non modificabile, non lo so. Però l'idea è che è
**monodirezionale**. È utile all'utente perché per il calendario non deve aprire il gestionale tutte le
volte: apre il calendario e ha già le informazioni che gli servono.

### 9 · 07.49.49 (20 s)
Per gestire tutte queste cose — lezioni, pagamenti, studenti — **form CRUD**: creazione, modifica,
cancellazione e così via.

### 10 · 07.52.30 (145 s)
Un punto su cui andrebbe speso un minuto è il **calcolo del saldo**. In un primo momento — quello che
hai adesso sul gestionale — il saldo viene **calcolato sul momento**: a ogni studente è associata una
**tariffa oraria**; sulla base del numero delle ore fatte si calcola quanti soldi ti deve lo studente.
Poi si fa la somma dei pagamenti (pagamento in data X, "ho preso 100 euro"). Fai la somma di quello che
ti deve, la somma di quello che ti ha già dato, e vedi se è in credito o in debito. Tuttavia sarebbe
meglio **riprogettarlo** in maniera diversa: se dopo un anno — magari il ragazzo era in prima liceo e
arriva in quarta — ci sono **aumenti di prezzo**, giustamente, anche per l'inflazione, serve un sistema
per cui si riesce a **cambiare la tariffa oraria** [senza alterare lo storico]. Questo è un punto
interessante. [Nel vocale c'è un'esclamazione di sottofondo non pertinente, omessa.]
