## WhatsApp Ptt 2026-10-02 at 07.34.34.ogg (19s)

Intanto magari, prima battuta, poi ci sono domande se c'è qualche questione su cui vuoi portare l'attenzione e l'analizziamo in dettaglio.

## WhatsApp Ptt 2026-10-02 at 07.36.47.ogg (125s)

Allora, l'idea è questa. Io, così come Simone, che ha detto in altre ripetizioni, siamo i target per questo software, abbiamo la necessità di tenere traccia dei dati delle lezioni che facciamo. Ogni lezione è singola, non c'è un solo studente per ogni lezione, possiamo fare tante lezioni con ogni studente. Dobbiamo tenere traccia sostanzialmente dei dati degli studenti, quindi una sezione anagrafica, dobbiamo tenere traccia della lezione, nel senso che ci serve sapere quando è stata fatta, con chi è stata fatta, per quanto tempo. E poi dobbiamo tenere traccia dei pagamenti, quindi della recezione di tot euro. Cioè di tot euro fatta o come bonifico o come contanti. Vabbè, ci metti la scelta. La recezione è soltanto una cosa compilativa, nel senso che non devi collegarlo con motori di pagamento esterni, Satispay, Paypal, queste cose qua. Semplicemente, quando la persona X mi paga, apriamo il gestionale e diciamo, ok, ho preso X euro dalla X persona in questo giorno.

## WhatsApp Ptt 2026-10-02 at 07.37.25.ogg (27s)

Quindi è paragonabile a un libro mastro, quindi uno storico di tutto quello che è stato fatto, una cronologia degli snapshots, di tutto quello che è stato fatto per quanto riguarda le lezioni e per quanto riguarda i pagamenti.

## WhatsApp Ptt 2026-10-02 at 07.38.31.ogg (60s)

Ogni volta che si sape l'applicazione è fondamentale avere sotto mano le prossime lezioni che devo svolgere, che l'utente, che il ragazzo di quella lezione deve svolgere, e poi situazione contabile dei ragazzi, specialmente per quanto riguarda debiti e crediti. Ora, debiti e crediti li puoi vedere dalla mia prospettiva o dalla prospettiva dello studente, sono uno opposto all'altro. Per il momento, quando io segno che uno studente ha un debito, lo studente ha un debito verso di me, quindi ha fatto delle ore che mi deve pagare. Se invece uno studente è in credito, significa che mi ha anticipato dei soldi e quindi ha un credito delle ore.

## WhatsApp Ptt 2026-10-02 at 07.40.57.ogg (42s)

In una primissima versione avevo fatto anche una pagina con tutte le lezioni, una pagina con tutti i pagamenti, che però poi sono state abolite. Quindi se ci sono nella repo, non mi ricordo se lo lasciate, ma se ci sono le ho tolte perché abbiamo visitato con Simone che non servono sostanzialmente, è più semplice fare un click in più per selezionare a monte lo studente.

## WhatsApp Ptt 2026-10-02 at 07.42.28.ogg (71s)

Poi, le lezioni. Ogni lezione si svolge nello stesso giorno, da un orario di partenza a un orario di fine. Di ogni lezione bisogna tenere lo studente, che la svolta anche, e poi una materia. La materia scolastica, italiana, inglese, storia, informatica e così via, disponibile tramite un menu a tendina. Nella versione che ho dato c'è anche una textarea, note, in cui io di solito inserisco l'argomento. Ho valutato se lasciarlo sotto forma di note, se rinominarlo argomento, o se avere due textarea. Non lo so, poi lo consideri tu.

## WhatsApp Ptt 2026-10-02 at 07.47.40.ogg (65s)

Considera che per entrare con Google hai bisogno di una procedura di verifica da parte di Google dell'applicativo che io non ho ancora fatto per poter essere accessibile liberamente. Da tutto questo punto di vista tu hai CGPT ok, ma Antigravity che è l'agente for flow di Google ha tutta una serie di integrazioni con la parte di API di Google che se CGPT non riuscisse potesse accedere anche da lì, quando l'ho fatto non c'era con me, sono dovuto leggere i documenti.

## WhatsApp Ptt 2026-10-02 at 07.49.23.ogg (91s)

Avrei notato probabilmente che non c'è una homepage, quindi magari ecco, da considerare il fare anche quello. Sì, ecco, oltre all'integrazione con il login, Google è necessario anche per la sincronizzazione con il calendario. L'idea è che tutte le volte che tu crei una nuova lezione, la lezione viene creata all'interno del gisterale e poi si riporta un evento su Google Calendar dell'account con cui hai fatto il login. Se sposti una lezione o cancelli una lezione per Google Calendar questo non influenza il tuo gestionale. Quindi da capire, cioè, per vedere tu se riesci a renderlo non modificabile, non lo so. Però l'idea è che è monodirezionale. Se è utile questa cosa qui, o meglio, è utile all'utente perché per il calendario non devi aprire il gestore tutte le volte, apre il calendario e ha già le informazioni che mi servono.

## WhatsApp Ptt 2026-10-02 at 07.49.49.ogg (20s)

Vabbè, per gestire tutte queste cose qui, lezioni, pagamenti, studenti, classi form, CAD, quindi per la creazione, creazione, cancellazione e così via.

## WhatsApp Ptt 2026-10-02 at 07.52.30.ogg (145s)

Un punto su cui andrebbe speso un minuto è il calcolo del saldo, la gestione del saldo. In un primo momento, cioè quello che tu hai adesso sul gestionale, il saldo viene calcolato sul momento. Cioè significa che noi abbiamo associato a ogni studente una tariffa oraria, quindi sulla base del numero delle ore fatte si calcola quanti soldi ti deve lo studente. Poi si fa la somma dei pagamenti, pagamenti che sono pagamento in data X, ho preso 100 euro per dire no. Quindi tu fai la somma di quello che ti deve, la somma di quello che ti hai già dato e poi vedi se sei in credito o se sei in debito. Tuttavia, sarebbe meglio riprogettarli in maniera diversa, in modo tale che se dopo un anno, magari il bimbo era in prima liceo, quando arriva in quarta, il ragazzo a fare numeri tipi piccoli con degli alzi di prezzo, giustamente, proprio perché c'è l'inflazione e gli alzi di prezzo. Cazzo, va dentro! Sì! Sì, come dicevo, quindi dovessi riscuorre con un sistema per cui riesce a cambiare la tariffa oraria. però questo è un punto interessante

