export const accessCatalog = {
  en: {
    editor: {
      title: "Permissions",
      dependenciesUi: {
        requiredTitle: "Required permissions need access",
        enableRequired: "Enable required permissions",
        replacesDeny: "Replaces an explicit denial",
        blocked: "You cannot change these permissions: {permissions}.",
        enabled: "Updated required permissions: {permissions}.",
        disabled: "Applied access changes to: {permissions}.",
        disableTitle: "Update dependent permissions?",
        disableHelp:
          "Changing {permission} also requires disabling these dependent permissions:",
        inheritedDenials:
          "Dependent permissions inherited from a role will receive a Deny override for this user.",
        keepUnchanged: "Keep unchanged",
        applyChanges: "Apply changes",
        disableCount: "Disable all {count} permissions",
      },
      customizePermissions: "Customize permissions",
      personalizedPermissions: "Personalized permissions",
      roleDefaults: "Role permissions · No custom changes",
      userOverrideSummary:
        "Custom changes · {allowed} allowed, {denied} denied",
      sheetSaveHelp: "Review and save changes on the user page.",
      review: {
        before: "Before",
        after: "After",
        effective: "Effective access changes",
        added: "Granted",
        removed: "Removed",
        changed: "Scope changed",
        sensitive: "Sensitive access",
        dangerHelp:
          "These changes remove access or modify sensitive permissions. Check each change before saving.",
        expandedHelp:
          "These changes modify permission scopes or grant access to all records. Check the scope before saving.",
        noChanges: "No effective access changes.",
        stale:
          "Permissions changed after this review. Go back and review them again.",
      },
      search: "Search permissions",
      searchPlaceholder: "Search permissions…",
      onlyCustom: "Only custom",
      customOverride: "Custom",
      customCount:
        "{count, plural, one {# custom override} other {# custom overrides}}",
      results: "{count} permissions found",
      categories: "Permission categories",
      groups: {
        administration: "Administration",
        fleet: "Fleet",
        service: "Service",
        rentals: "Rentals",
        people: "People",
        finance: "Finance",
        client: "Client",
      },
      modes: { allow: "Allow", default: "Default", deny: "Deny" },
      modeFor: "Access for {permission}",
      scopeClose: "Done",
      scopeSearch: "Search access scopes…",
      scopeClearSearch: "Clear search",
      scopeNoResults: "No scopes match your search.",
      scopeDescriptions: {
        OWN: "Only records belonging to this user, where this permission applies.",
        ASSIGNED: "Only records linked to work assigned to this user.",
        AVAILABLE: "Unassigned service work available to claim.",
        ALL: "All records this action permits, subject to management restrictions.",
        COMBINED:
          "Assigned service work and unassigned work available to claim.",
        NONE: "This user cannot perform this action.",
      },
      scopeBadges: {
        OWN: "Own only",
        ASSIGNED: "Assigned only",
        AVAILABLE: "Available work",
        ALL: "All records",
      },
      scope: "Scope",
      scopeFor: "Scope for {permission}",
      scopes: {
        OWN: "Own data",
        ASSIGNED: "Assigned",
        AVAILABLE: "Available",
        ALL: "All records",
      },
      assignedAndAvailable: "Assigned + available",
      noAccess: "No access",
      details: "Details",
      inheritedFrom: "From {roles}",
      notInRole: "The base role does not allow this permission.",
      overrideHelp: "This exception replaces the role’s access.",
      dependencies: "Required permissions",
      reason: "Reason (optional)",
      reasonFor: "Reason for {permission}",
      reasonPlaceholder: "Why this access differs from the role",
      noBaseRole: "No base role",
      inheritanceHelp:
        "Default follows the base role. Allow sets a custom scope. Deny blocks this permission.",
      roleHelp:
        "Allow adds a permission to this role. Deny leaves it out. Members inherit changes to the role.",
      noCustom: "No custom permissions",
      noCustomHelp:
        "All permissions follow the base role. Choose Allow or Deny to create an exception.",
      noResults: "No permissions match these filters",
      noResultsHelp: "Try another search or show all permissions.",
      clearFilters: "Show all permissions",
    },
    descriptions: {
      users: {
        read: "View users, roles, and effective permissions.",
        invite: "Create accounts and manage invitations for non-admin users.",
        status: { update: "Activate, suspend, or disable non-admin accounts." },
        roles: { update: "Assign permitted roles to non-admin users." },
        permissions: {
          update:
            "Customize non-admin users' permissions within your own access.",
        },
      },
      roles: {
        read: "Inspect role definitions and inherited permissions.",
        update:
          "Edit non-admin roles within your own access. Only Super Admins can edit Admin.",
      },
      persons: {
        read: "View people and their contact details.",
        create: "Add a person to the customer records.",
        update: "Update personal and contact details.",
        archive: "Archive a person from the active records.",
        audit: {
          read: "See the history of changes to a person.",
        },
      },
      person_documents: {
        read: "Open identity documents and their details.",
        write: "Upload and update identity documents.",
        delete: "Remove identity documents from a person.",
        extract: "Read personal details automatically from a document.",
      },
      scooters: {
        read: "View the fleet or only scooters linked to assigned service work.",
        create: "Register a new scooter in the fleet.",
        update: "Update scooter details.",
        archive: "Archive a scooter from the active fleet.",
      },
      scooter_documents: {
        read: "Open scooter documents and their details.",
        write: "Upload and update scooter documents.",
        extract: "Read vehicle details automatically from a document.",
      },
      scooter_brands: {
        read: "View the brands used when adding or editing scooters.",
        manage: "Manage the scooter brand list.",
      },
      vehicle_civ: {
        read: "Use vehicle reference data in scooter forms.",
      },
      finance: {
        books: {
          read: "View the available finance books.",
        },
        suppliers: {
          read: "View suppliers and their details.",
          manage: "Add and update supplier details.",
        },
        accounts: {
          read: "View financial accounts and balances.",
        },
        operations: {
          read: "View recorded financial operations.",
          reverse: "Reverse a posted operation with an auditable correction.",
        },
        reference: {
          read: "Use categories and reference data in financial forms.",
        },
        expenses: {
          create: "Record company expenses and supporting receipts.",
        },
        funding: {
          create: "Record money contributed to the company.",
        },
        settlements: {
          preview:
            "Preview amounts to settle between the company and its associates.",
        },
      },
      problems: {
        read: "View assigned repairs, available work, or all service problems.",
        create: "Report a problem with a scooter.",
        update: "Update repair progress and work notes.",
        resolve: "Mark assigned repairs or any repair as resolved.",
        claim: "Assign an unassigned problem to yourself.",
        assign: "Assign or reassign a problem to another mechanic.",
        prioritize: "Change the priority of service problems.",
        reopen: "Reopen a problem that needs more work.",
      },
      portal: {
        profile: {
          read: "View the linked customer profile. Customer portal access must also be enabled.",
        },
        rentals: {
          read: "View only rentals belonging to the linked customer.",
        },
        scooter_documents: {
          read: "View published scooter documents for the customer’s eligible rentals.",
        },
      },
      rentals: {
        read: "View rentals and the associated scooter and renter.",
        create: "Create a scooter rental for a customer.",
        handover: "Record handing a scooter over to a renter.",
        return: "Record the return of a rented scooter.",
      },
    },
    permissions: {
      users: {
        read: "Users · View",
        invite: "Users · Invite",
        status: { update: "Users · Manage account access" },
        roles: { update: "Users · Assign roles" },
        permissions: { update: "Users · Customize permissions" },
      },
      roles: { read: "Roles · View", update: "Roles · Edit permissions" },
      persons: {
        read: "People · View",
        create: "People · Create",
        update: "People · Edit",
        archive: "People · Archive",
        audit: {
          read: "People · View history",
        },
      },
      person_documents: {
        read: "Identity documents · View",
        write: "Identity documents · Upload and edit",
        delete: "Identity documents · Delete",
        extract: "Identity documents · Extract details",
      },
      scooters: {
        read: "Scooters · View",
        create: "Scooters · Create",
        update: "Scooters · Edit",
        archive: "Scooters · Archive",
      },
      scooter_documents: {
        read: "Scooter documents · View",
        write: "Scooter documents · Upload and edit",
        extract: "Scooter documents · Extract details",
      },
      scooter_brands: {
        read: "Scooter brands · View",
        manage: "Scooter brands · Manage",
      },
      vehicle_civ: {
        read: "Vehicle reference data · View",
      },
      finance: {
        books: {
          read: "Finance books · View",
        },
        suppliers: {
          read: "Suppliers · View",
          manage: "Suppliers · Manage",
        },
        accounts: {
          read: "Accounts · View",
        },
        operations: {
          read: "Operations · View",
          reverse: "Operations · Reverse",
        },
        reference: {
          read: "Finance reference data · View",
        },
        expenses: {
          create: "Expenses · Create",
        },
        funding: {
          create: "Company funding · Create",
        },
        settlements: {
          preview: "Settlements · Preview",
        },
      },
      problems: {
        read: "Service work · View",
        create: "Service work · Create",
        update: "Service work · Edit",
        resolve: "Service work · Resolve",
        claim: "Service work · Claim available work",
        assign: "Service work · Assign to others",
        prioritize: "Service work · Set priority",
        reopen: "Service work · Reopen",
      },
      portal: {
        profile: {
          read: "Customer profile · View",
        },
        rentals: {
          read: "Own rentals · View",
        },
        scooter_documents: {
          read: "Renter documents · View",
        },
      },
      rentals: {
        read: "Rentals · View",
        create: "Rentals · Create",
        handover: "Rentals · Hand over",
        return: "Rentals · Record return",
      },
    },
  },
  ro: {
    editor: {
      title: "Permisiuni",
      dependenciesUi: {
        requiredTitle: "Permisiunile necesare au nevoie de acces",
        enableRequired: "Activează permisiunile necesare",
        replacesDeny: "Înlocuiește un refuz explicit",
        blocked: "Nu poți modifica aceste permisiuni: {permissions}.",
        enabled: "Permisiuni necesare actualizate: {permissions}.",
        disabled: "Modificări de acces aplicate pentru: {permissions}.",
        disableTitle: "Modifici permisiunile dependente?",
        disableHelp:
          "Modificarea permisiunii {permission} necesită și dezactivarea acestor permisiuni dependente:",
        inheritedDenials:
          "Permisiunile dependente moștenite din rol vor primi un refuz explicit pentru acest utilizator.",
        keepUnchanged: "Păstrează neschimbat",
        applyChanges: "Aplică modificările",
        disableCount: "Dezactivează toate cele {count} permisiuni",
      },
      customizePermissions: "Personalizează permisiunile",
      personalizedPermissions: "Permisiuni personalizate",
      roleDefaults: "Permisiunile rolului · Fără modificări personalizate",
      userOverrideSummary:
        "Modificări personalizate · {allowed} permise, {denied} refuzate",
      sheetSaveHelp:
        "Verifică și salvează modificările pe pagina utilizatorului.",
      review: {
        before: "Înainte",
        after: "După",
        effective: "Modificări ale accesului efectiv",
        added: "Permis",
        removed: "Eliminat",
        changed: "Domeniu modificat",
        sensitive: "Acces sensibil",
        dangerHelp:
          "Aceste modificări elimină accesul sau schimbă permisiuni sensibile. Verifică fiecare modificare înainte de salvare.",
        expandedHelp:
          "Aceste modificări schimbă domeniul permisiunilor sau permit accesul la toate înregistrările. Verifică domeniul înainte de salvare.",
        noChanges: "Nicio modificare a accesului efectiv.",
        stale:
          "Permisiunile s-au schimbat după verificare. Revino și verifică-le din nou.",
      },
      search: "Caută permisiuni",
      searchPlaceholder: "Caută permisiuni…",
      onlyCustom: "Doar personalizate",
      customOverride: "Personalizată",
      customCount:
        "{count, plural, one {# excepție personalizată} few {# excepții personalizate} other {# de excepții personalizate}}",
      results: "{count} permisiuni găsite",
      categories: "Categorii de permisiuni",
      groups: {
        administration: "Administrare",
        fleet: "Flotă",
        service: "Service",
        rentals: "Închirieri",
        people: "Persoane",
        finance: "Financiar",
        client: "Client",
      },
      modes: { allow: "Permite", default: "Implicit", deny: "Refuză" },
      modeFor: "Acces pentru {permission}",
      scopeClose: "Gata",
      scopeSearch: "Caută un domeniu de acces…",
      scopeClearSearch: "Șterge căutarea",
      scopeNoResults: "Niciun domeniu nu corespunde căutării.",
      scopeDescriptions: {
        OWN: "Doar înregistrările acestui utilizator, pentru care se aplică permisiunea.",
        ASSIGNED:
          "Doar înregistrările legate de lucrările atribuite acestui utilizator.",
        AVAILABLE:
          "Lucrări de service neatribuite, disponibile pentru preluare.",
        ALL: "Toate înregistrările permise pentru această acțiune, cu restricțiile de administrare aplicabile.",
        COMBINED:
          "Lucrările atribuite și cele neatribuite, disponibile pentru preluare.",
        NONE: "Utilizatorul nu poate efectua această acțiune.",
      },
      scopeBadges: {
        OWN: "Doar proprii",
        ASSIGNED: "Doar atribuite",
        AVAILABLE: "Lucrări disponibile",
        ALL: "Toate înregistrările",
      },
      scope: "Domeniu",
      scopeFor: "Domeniu pentru {permission}",
      scopes: {
        OWN: "Date proprii",
        ASSIGNED: "Atribuite",
        AVAILABLE: "Disponibile",
        ALL: "Toate datele",
      },
      assignedAndAvailable: "Atribuite + disponibile",
      noAccess: "Fără acces",
      details: "Detalii",
      inheritedFrom: "Din rolul {roles}",
      notInRole: "Rolul de bază nu permite această acțiune.",
      overrideHelp: "Această excepție înlocuiește accesul din rol.",
      dependencies: "Permisiuni necesare",
      reason: "Motiv (opțional)",
      reasonFor: "Motiv pentru {permission}",
      reasonPlaceholder: "De ce diferă accesul față de rol",
      noBaseRole: "Fără rol de bază",
      inheritanceHelp:
        "Implicit preia accesul din rol. Permite stabilește un domeniu personalizat. Refuză blochează permisiunea.",
      roleHelp:
        "Permite adaugă permisiunea la rol. Refuză o exclude. Membrii preiau modificările rolului.",
      noCustom: "Nicio permisiune personalizată",
      noCustomHelp:
        "Toate permisiunile provin din rol. Alege Permite sau Refuză pentru o excepție.",
      noResults: "Nicio permisiune nu corespunde filtrelor",
      noResultsHelp: "Încearcă altă căutare sau afișează toate permisiunile.",
      clearFilters: "Arată toate permisiunile",
    },
    descriptions: {
      users: {
        read: "Vezi utilizatorii, rolurile și permisiunile efective.",
        invite:
          "Creează conturi și gestionează invitațiile utilizatorilor fără rol de administrator.",
        status: {
          update:
            "Activează, suspendă sau dezactivează conturi fără rol de administrator.",
        },
        roles: {
          update:
            "Atribuie roluri permise utilizatorilor fără rol de administrator.",
        },
        permissions: {
          update:
            "Personalizează permisiunile utilizatorilor în limitele propriului acces.",
        },
      },
      roles: {
        read: "Vezi definițiile rolurilor și permisiunile moștenite.",
        update:
          "Editează rolurile fără privilegii de administrator în limitele propriului acces.",
      },
      persons: {
        read: "Vizualizează persoanele și datele lor de contact.",
        create: "Adaugă o persoană în evidența clienților.",
        update: "Actualizează datele personale și de contact.",
        archive: "Arhivează o persoană din evidența activă.",
        audit: {
          read: "Consultă istoricul modificărilor unei persoane.",
        },
      },
      person_documents: {
        read: "Consultă documentele de identitate și detaliile lor.",
        write: "Încarcă și actualizează documentele de identitate.",
        delete: "Șterge documentele de identitate ale unei persoane.",
        extract: "Extrage automat datele personale dintr-un document.",
      },
      scooters: {
        read: "Vizualizează flota sau doar scuterele asociate reparațiilor atribuite.",
        create: "Înregistrează un scuter nou în flotă.",
        update: "Actualizează datele scuterelor.",
        archive: "Arhivează un scuter din flota activă.",
      },
      scooter_documents: {
        read: "Consultă documentele scuterelor și detaliile lor.",
        write: "Încarcă și actualizează documentele scuterelor.",
        extract: "Extrage automat datele vehiculului dintr-un document.",
      },
      scooter_brands: {
        read: "Consultă mărcile folosite la adăugarea sau editarea scuterelor.",
        manage: "Gestionează lista mărcilor de scutere.",
      },
      vehicle_civ: {
        read: "Folosește datele de referință ale vehiculelor în formularele scuterelor.",
      },
      finance: {
        books: {
          read: "Consultă registrele financiare disponibile.",
        },
        suppliers: {
          read: "Consultă furnizorii și datele lor.",
          manage: "Adaugă și actualizează datele furnizorilor.",
        },
        accounts: {
          read: "Consultă conturile financiare și soldurile.",
        },
        operations: {
          read: "Consultă operațiunile financiare înregistrate.",
          reverse:
            "Stornează o operațiune înregistrată, păstrând istoricul corecției.",
        },
        reference: {
          read: "Folosește categoriile și datele de referință în formularele financiare.",
        },
        expenses: {
          create:
            "Înregistrează cheltuielile firmei și documentele justificative.",
        },
        funding: {
          create: "Înregistrează sumele aduse în firmă.",
        },
        settlements: {
          preview:
            "Previzualizează sumele de decontat între firmă și asociați.",
        },
      },
      problems: {
        read: "Consultă reparațiile atribuite, lucrările disponibile sau toate problemele.",
        create: "Raportează o problemă a unui scuter.",
        update: "Actualizează progresul reparației și notele de lucru.",
        resolve:
          "Marchează ca rezolvate reparațiile atribuite sau orice reparație.",
        claim: "Preia pentru tine o problemă care nu este atribuită.",
        assign: "Atribuie sau reatribuie o problemă altui mecanic.",
        prioritize: "Modifică prioritatea problemelor de service.",
        reopen: "Redeschide o problemă care necesită lucrări suplimentare.",
      },
      portal: {
        profile: {
          read: "Consultă profilul clientului asociat. Accesul la portal trebuie să fie activat.",
        },
        rentals: {
          read: "Consultă doar închirierile clientului asociat.",
        },
        scooter_documents: {
          read: "Consultă documentele publicate ale scuterelor pentru închirierile eligibile ale clientului.",
        },
      },
      rentals: {
        read: "Consultă închirierile, scuterul și chiriașul asociat.",
        create: "Creează o închiriere de scuter pentru un client.",
        handover: "Înregistrează predarea scuterului către chiriaș.",
        return: "Înregistrează returnarea scuterului închiriat.",
      },
    },
    permissions: {
      users: {
        read: "Utilizatori · Vizualizare",
        invite: "Utilizatori · Invitare",
        status: { update: "Utilizatori · Gestionare acces la cont" },
        roles: { update: "Utilizatori · Atribuire roluri" },
        permissions: { update: "Utilizatori · Personalizare permisiuni" },
      },
      roles: {
        read: "Roluri · Vizualizare",
        update: "Roluri · Editare permisiuni",
      },
      persons: {
        read: "Persoane · Vizualizare",
        create: "Persoane · Creare",
        update: "Persoane · Editare",
        archive: "Persoane · Arhivare",
        audit: {
          read: "Persoane · Vizualizare istoric",
        },
      },
      person_documents: {
        read: "Documente de identitate · Vizualizare",
        write: "Documente de identitate · Încărcare și editare",
        delete: "Documente de identitate · Ștergere",
        extract: "Documente de identitate · Extragere detalii",
      },
      scooters: {
        read: "Scutere · Vizualizare",
        create: "Scutere · Creare",
        update: "Scutere · Editare",
        archive: "Scutere · Arhivare",
      },
      scooter_documents: {
        read: "Documente scuter · Vizualizare",
        write: "Documente scuter · Încărcare și editare",
        extract: "Documente scuter · Extragere detalii",
      },
      scooter_brands: {
        read: "Mărci scutere · Vizualizare",
        manage: "Mărci scutere · Administrare",
      },
      vehicle_civ: {
        read: "Date de referință vehicul · Vizualizare",
      },
      finance: {
        books: {
          read: "Registre financiare · Vizualizare",
        },
        suppliers: {
          read: "Furnizori · Vizualizare",
          manage: "Furnizori · Administrare",
        },
        accounts: {
          read: "Conturi · Vizualizare",
        },
        operations: {
          read: "Operațiuni · Vizualizare",
          reverse: "Operațiuni · Stornare",
        },
        reference: {
          read: "Date financiare de referință · Vizualizare",
        },
        expenses: {
          create: "Cheltuieli · Creare",
        },
        funding: {
          create: "Finanțarea firmei · Creare",
        },
        settlements: {
          preview: "Decontări · Previzualizare",
        },
      },
      problems: {
        read: "Reparații · Vizualizare",
        create: "Reparații · Creare",
        update: "Reparații · Editare",
        resolve: "Reparații · Rezolvare",
        claim: "Reparații · Preluare lucrări disponibile",
        assign: "Reparații · Atribuire altor persoane",
        prioritize: "Reparații · Stabilire prioritate",
        reopen: "Reparații · Redeschidere",
      },
      portal: {
        profile: {
          read: "Profil client · Vizualizare",
        },
        rentals: {
          read: "Închirieri proprii · Vizualizare",
        },
        scooter_documents: {
          read: "Documente pentru chiriași · Vizualizare",
        },
      },
      rentals: {
        read: "Închirieri · Vizualizare",
        create: "Închirieri · Creare",
        handover: "Închirieri · Predare",
        return: "Închirieri · Înregistrare returnare",
      },
    },
  },
} as const;
